'use strict';

const axios = require('axios');

const ISSUE_DETAILS = {
  'Outdated Design': 'the design looks dated next to competitors, which can make people question how established the business is',
  'Slow Loading': "it takes too long to load, and most visitors leave before it even finishes",
  'Not Mobile Friendly': "it doesn't work properly on mobile, where most visitors are browsing from",
  'Broken Links': 'there are broken links, which makes the site feel unfinished',
  'Broken Images': "several images aren't loading properly, which looks unprofessional",
  'Missing SSL': `the site isn't secured with SSL, so browsers flag it as "Not Secure"`,
  'Poor Navigation': "it's hard to find key information, which loses visitors before they get to what you offer",
  'No Booking System': "there's no way to book online, so you're relying on people calling during business hours",
  'No Contact Form': "there's no contact form, so getting in touch takes more effort than it should",
  'Poor CTA': "there's no clear next step for visitors, so a lot of interest is probably going nowhere",
  'Text Hard To Read': 'the text is hard to read, which pushes visitors away before they take anything in',
  'Low Quality Images': 'the images are low quality, which undersells the actual work',
  'No Testimonials': 'there are no reviews or testimonials shown, which makes it harder for new visitors to trust you',
  'No Portfolio': "there's no portfolio or past work shown, so visitors have nothing to judge quality by",
  'No Google Reviews': "there's no sign of Google reviews, which is often the first thing people check",
  'Old Branding': 'the branding feels outdated, which can undersell how good the business actually is',
  'Confusing Layout': 'the layout is confusing, so visitors likely leave before finding what they came for',
  'Cluttered Mobile Nav': 'the mobile menu takes up a big chunk of the screen and feels cluttered',
  'Weak Logo': "the logo doesn't reflect the quality of the business",
};

// Turns the raw audit fields on a lead into the kind of plain-English issue
// list the prompt below expects ("Page speed 56/100, no SSL, not
// mobile-friendly, low-res images, outdated design"), rather than handing
// the model our internal checkbox labels or JSON.
function buildIssuesSummary(lead) {
  const parts = [];
  if (typeof lead.websiteScore === 'number') parts.push(`page speed ${lead.websiteScore}/100`);
  for (const issue of lead.issuesChecklist ?? []) {
    parts.push(ISSUE_DETAILS[issue] ? `${issue.toLowerCase()} (${ISSUE_DETAILS[issue]})` : issue.toLowerCase());
  }
  if (lead.aiDesignNote) parts.push(lead.aiDesignNote);
  return parts.length > 0 ? parts.join('; ') : 'no major technical issues found, but there is likely still room to improve conversion';
}

function buildPrompt({ businessName, contactName, issuesSummary, myName }) {
  return `Act as a senior conversion-focused web strategist. You are helping a web developer named ${myName} write a cold outreach email to a local business owner. ${myName} has performed an audit on the business's website and identified the following technical issues:

${issuesSummary}

Business name: ${businessName || 'the business'}
Contact name (if known): ${contactName || 'not known — do not invent one, do not use a placeholder like "[Name]"'}

Write a 3-paragraph email body (no subject line, no opening greeting like "Hi X," — that line is added separately by the sender) that:
1. The Opening: Acknowledge the business's value, then immediately frame the audit findings as a "missed opportunity" for revenue, not just a technical failure.
2. The Impact: Explain up to 3 of the biggest issues above, but translate each into customer impact in plain language (e.g. instead of "no SSL," say browsers are scaring customers away with a "Not Secure" warning).
3. The Low-Friction Call to Action: Propose a quick, no-obligation call or site walk-through where ${myName} shows them exactly how to fix these issues to improve their conversion rate.

Tone: Professional, helpful, local, and respectful. Avoid sounding like a pushy salesperson or a condescending tech expert. Do not use corporate jargon.

Respond with ONLY the plain-text email body — three paragraphs separated by a blank line, nothing else. No subject line, no greeting, no sign-off, no markdown, no labels like "Paragraph 1:".`;
}

async function writeWithGemini(prompt, apiKey) {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 30_000 }
  );
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
}

// Groq, Mistral, and OpenRouter all speak the same OpenAI-compatible
// chat-completions format for plain text, same as the vision audit chain.
async function writeWithOpenAiCompatible(prompt, apiKey, { baseUrl, model }) {
  const { data } = await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages: [{ role: 'user', content: prompt }] },
    { timeout: 30_000, headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

/**
 * Generates a personalized 3-paragraph outreach email body from a lead's
 * real audit findings, falling through the same provider chain (in the
 * same order) as the website design vision audit — each free tier has its
 * own cap, so one running dry shouldn't stop this from working.
 *
 * @param {object} lead - needs businessName, contactName, websiteScore,
 *   issuesChecklist, aiDesignNote (whatever's already on the lead from an audit).
 * @param {string} myName
 * @param {object} keys - { gemini, groq, mistral, openrouter }
 * @returns {Promise<string|null>} the email body, or null if every provider failed.
 */
async function generateAuditEmail(lead, myName, keys) {
  const issuesSummary = buildIssuesSummary(lead);
  const prompt = buildPrompt({
    businessName: lead.businessName,
    contactName: lead.contactName,
    issuesSummary,
    myName,
  });

  const providers = [
    { name: 'gemini', key: keys?.gemini, run: () => writeWithGemini(prompt, keys.gemini) },
    { name: 'groq', key: keys?.groq, run: () => writeWithOpenAiCompatible(prompt, keys.groq, { baseUrl: 'https://api.groq.com/openai/v1', model: 'meta-llama/llama-4-scout-17b-16e-instruct' }) },
    { name: 'mistral', key: keys?.mistral, run: () => writeWithOpenAiCompatible(prompt, keys.mistral, { baseUrl: 'https://api.mistral.ai/v1', model: 'pixtral-12b-2409' }) },
    { name: 'openrouter', key: keys?.openrouter, run: () => writeWithOpenAiCompatible(prompt, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-12b-v2-vl:free' }) },
    // Cerebras — verified live, but multimodal is off for this account
    // ("multimodal_not_enabled"), so it's text-only and can't join the
    // website design audit's vision chain. Fine here since this is plain text.
    { name: 'cerebras', key: keys?.cerebras, run: () => writeWithOpenAiCompatible(prompt, keys.cerebras, { baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b' }) },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const result = await provider.run();
      if (result) return result;
    } catch (err) {
      console.warn(`[aiEmailWriter] ${provider.name} failed: ${err.response?.data?.error?.message ?? err.message}`);
    }
  }
  return null;
}

module.exports = { generateAuditEmail };
