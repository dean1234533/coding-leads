'use strict';

const axios = require('axios');

// Only issues a human would actually judge from looking at the page, not
// the technical ones PageSpeed already covers (SSL, alt text). Text Hard To
// Read lives here rather than as a Lighthouse contrast-audit check — that
// binary WCAG check fails on a single low-contrast element (a footer link,
// a hover state) even when the actual body text reads fine, so actually
// looking at the screenshot is a more reliable signal.
const VISUAL_ISSUES = [
  'Outdated Design',
  'Old Branding',
  'Weak Logo',
  'Confusing Layout',
  'Cluttered Mobile Nav',
  'Poor CTA',
  'Text Hard To Read',
  'No Testimonials',
  'No Portfolio',
  'No Google Reviews',
  'No Booking System',
  'No Contact Form',
];

const PROMPT = `You are assessing a business website screenshot for a web design agency's cold outreach. Look at this screenshot and identify which of the following issues are visibly true. Only include an issue if you can genuinely observe it in the screenshot — do not guess or assume. If the page looks clean, modern, and well-branded, return an empty list.

If the screenshot is NOT an actual business website page — a 404/error page, a blank page, a parked/placeholder domain, a login wall, or anything else where there's no real page content to judge — you MUST return an empty issues list. Do not tick any design-quality issues (CTA, testimonials, branding, layout, etc.) in that case, since there's nothing on the page to actually judge. Just describe what's wrong in the impression instead.

Possible issues (respond using these exact strings only): ${VISUAL_ISSUES.join(', ')}

Respond with ONLY a JSON object in this exact shape, no other text:
{"issues": ["..."], "impression": "one short sentence describing the overall first impression"}`;

function parseDataUri(screenshotDataUri) {
  const match = screenshotDataUri.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64Data: match[2] };
}

function parseModelJson(text) {
  if (!text) return null;
  // Some free models wrap JSON in markdown fences despite instructions not to.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((i) => VISUAL_ISSUES.includes(i)) : [];
  return { issues, impression: typeof parsed.impression === 'string' ? parsed.impression : '' };
}

async function assessWithGemini(image, apiKey) {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: image.mimeType, data: image.base64Data } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json' },
    },
    { timeout: 30_000 }
  );
  return parseModelJson(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

// Groq, Mistral, and OpenRouter all speak the same OpenAI-compatible
// chat-completions + vision message format, so one function covers all three.
async function assessWithOpenAiCompatible(image, apiKey, { baseUrl, model }) {
  const { data } = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64Data}` } },
        ],
      }],
      response_format: { type: 'json_object' },
    },
    { timeout: 30_000, headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return parseModelJson(data.choices?.[0]?.message?.content);
}

/**
 * Tries each configured vision model in order until one succeeds — each
 * free-tier provider has its own daily/rate cap, so falling through to the
 * next one instead of just failing means a single provider running dry
 * doesn't stop audits from working.
 *
 * @param {string} screenshotDataUri - base64 data: URI from PageSpeed's
 *   `final-screenshot` audit.
 * @param {object} keys - { gemini, groq, mistral, openrouter } — any may be
 *   missing/empty, in which case that provider is skipped.
 * @returns {Promise<{issues: string[], impression: string}|null>} null only
 *   if every configured provider failed.
 */
async function assessDesign(screenshotDataUri, keys) {
  if (!screenshotDataUri) return null;
  const image = parseDataUri(screenshotDataUri);
  if (!image) return null;

  const providers = [
    { name: 'gemini', key: keys?.gemini, run: () => assessWithGemini(image, keys.gemini) },
    { name: 'groq', key: keys?.groq, run: () => assessWithOpenAiCompatible(image, keys.groq, { baseUrl: 'https://api.groq.com/openai/v1', model: 'meta-llama/llama-4-scout-17b-16e-instruct' }) },
    { name: 'mistral', key: keys?.mistral, run: () => assessWithOpenAiCompatible(image, keys.mistral, { baseUrl: 'https://api.mistral.ai/v1', model: 'pixtral-12b-2409' }) },
    { name: 'openrouter', key: keys?.openrouter, run: () => assessWithOpenAiCompatible(image, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-12b-v2-vl:free' }) },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const result = await provider.run();
      if (result) return result;
    } catch (err) {
      console.warn(`[websiteDesignAudit] ${provider.name} failed: ${err.response?.data?.error?.message ?? err.message}`);
    }
  }

  return null;
}

module.exports = { assessDesign };
