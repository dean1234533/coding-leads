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
  'Too Much Scrolling',
];

const PROMPT = `You are assessing a business website screenshot for a web design agency's cold outreach. Look at this screenshot and identify which of the following issues are visibly true.

Missing something that is genuinely missing is a worse mistake than over-flagging, so before answering, scan the ENTIRE screenshot from top to bottom — not just the first visible section — and explicitly check each of these on your way down the page:
- Reviews/testimonials: is there a section anywhere showing customer reviews, star ratings, or testimonial quotes? If you scan the whole page and find none, include "No Testimonials" and "No Google Reviews".
- Contact form: is there an actual form (name/email/message fields), a booking/enquiry form, or a "Book Now" widget anywhere on the page? If you scan the whole page and find none, include "No Contact Form" (and also "No Booking System" if there's separately no way to book or schedule anything).
- Portfolio: is there a gallery, portfolio, or "our work" section showing past projects or results? If not, include "No Portfolio".
- Call to action: is there a clear, visible button or link telling a visitor what to do next (e.g. "Book Now", "Contact Us", "Get a Quote")? If not, include "Poor CTA".
Do not conclude any of the above is missing just because it wasn't in the first section you looked at — only conclude it's missing after checking the whole screenshot, top to bottom.

Only include an issue if you can genuinely observe it — or genuinely fail to find it after checking the whole page — do not guess or assume. If the page looks clean, modern, well-branded, and everything above is present, return an empty list.

Be especially strict about "Text Hard To Read": only include it if the MAIN body text or headline is actually illegible — e.g. low-contrast text on a similar-colored background, text overlapping a busy image with no overlay/shadow, or text so small it can't be read at normal screenshot resolution. Do NOT include it for stylistic choices like light-gray secondary text, muted button labels, decorative fonts, or small footer/legal text — those are normal design patterns, not readability problems. This screenshot may show the FULL page (not just what's visible on first load) — check readability throughout, not just in the first visible section.

Include "Too Much Scrolling" only if the screenshot shows the full page and it is unusually long and image-heavy relative to how little actual information it conveys — e.g. many large, similar-looking photos back to back with little text or a clear call to action between them, such that a visitor would have to scroll a long way before finding key information or a way to get in touch.

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
 * @param {object} keys - { gemini, groq, mistral, openrouter, cerebras,
 *   cloudflare, huggingface, sambanova, github } — any may be missing/empty,
 *   in which case that provider is skipped. `cloudflare` is
 *   "accountId:apiToken", not a bare key.
 * @returns {Promise<{issues: string[], impression: string}|null>} null only
 *   if every configured provider failed.
 */
async function assessDesign(screenshotDataUri, keys) {
  if (!screenshotDataUri) return null;
  const image = parseDataUri(screenshotDataUri);
  if (!image) return null;

  const providers = [
    { name: 'gemini', key: keys?.gemini, run: () => assessWithGemini(image, keys.gemini) },
    // Groq's model catalog uses bare model IDs, not vendor-prefixed ones like
    // OpenRouter's ("meta-llama/llama-4-scout-..." 404'd with "does not
    // exist or you do not have access to it" — seen in production logs).
    { name: 'groq', key: keys?.groq, run: () => assessWithOpenAiCompatible(image, keys.groq, { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-4-scout-17b-16e-instruct' }) },
    { name: 'mistral', key: keys?.mistral, run: () => assessWithOpenAiCompatible(image, keys.mistral, { baseUrl: 'https://api.mistral.ai/v1', model: 'pixtral-12b-2409' }) },
    { name: 'openrouter', key: keys?.openrouter, run: () => assessWithOpenAiCompatible(image, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-12b-v2-vl:free' }) },
    // A second, independent OpenRouter free model — different underlying
    // host than the nemotron one above, so it isn't rate-limited by the same
    // upstream capacity. No new secret needed, reuses OPENROUTER_API_KEY.
    { name: 'openrouter-qwen', key: keys?.openrouter, run: () => assessWithOpenAiCompatible(image, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen2.5-vl-72b-instruct:free' }) },
    // Cerebras' only multimodal model so far — its usual text model
    // (gpt-oss-120b, used elsewhere for the email writer) doesn't take images.
    { name: 'cerebras', key: keys?.cerebras, run: () => assessWithOpenAiCompatible(image, keys.cerebras, { baseUrl: 'https://api.cerebras.ai/v1', model: 'gemma-4-31b' }) },
    // keys.cloudflare is "accountId:apiToken" (same convention as the email
    // writer's Cloudflare provider) since Workers AI's URL is per-account.
    {
      name: 'cloudflare',
      key: keys?.cloudflare,
      run: () => {
        const [accountId, apiToken] = String(keys.cloudflare).split(':');
        return assessWithOpenAiCompatible(image, apiToken, { baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`, model: '@cf/meta/llama-3.2-11b-vision-instruct' });
      },
    },
    // Router picks whichever backing provider is fastest for this model —
    // a different vision-capable model than the text-only one the email
    // writer uses on the same router/key.
    { name: 'huggingface', key: keys?.huggingface, run: () => assessWithOpenAiCompatible(image, keys.huggingface, { baseUrl: 'https://router.huggingface.co/v1', model: 'Qwen/Qwen2.5-VL-3B-Instruct' }) },
    { name: 'sambanova', key: keys?.sambanova, run: () => assessWithOpenAiCompatible(image, keys.sambanova, { baseUrl: 'https://api.sambanova.ai/v1', model: 'Llama-3.2-11B-Vision-Instruct' }) },
    // GitHub Models' free tier, auth'd with a PAT that has models:read scope
    // (not a normal GITHUB_TOKEN from Actions — a personal access token).
    { name: 'github', key: keys?.github, run: () => assessWithOpenAiCompatible(image, keys.github, { baseUrl: 'https://models.github.ai/inference', model: 'openai/gpt-4o-mini' }) },
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
