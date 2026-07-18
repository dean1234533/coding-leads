'use strict';

const axios = require('axios');

const CATEGORIES = ['Interested', 'Not Interested', 'Question', 'Other'];

function buildPrompt(snippet, businessName) {
  return `A cold outreach email was sent to a local business (${businessName || 'a business'}) offering website development services. Here is the first part of their reply:

"${snippet}"

Classify this reply into exactly ONE of these categories: Interested, Not Interested, Question, Other.
- Interested: they want to move forward, book a call, or sound positive/curious about proceeding.
- Not Interested: they're declining, saying no, or asking to be removed/unsubscribed.
- Question: they're asking for more information or clarification before deciding.
- Other: anything that doesn't clearly fit the above (auto-reply, out of office, unrelated).

Respond with ONLY the category name, exactly as written above, nothing else.`;
}

async function classifyWithGemini(prompt, apiKey) {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 15_000 }
  );
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
}

async function classifyWithOpenAiCompatible(prompt, apiKey, { baseUrl, model }) {
  const { data } = await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages: [{ role: 'user', content: prompt }], max_tokens: 10 },
    { timeout: 15_000, headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

function normalizeCategory(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[."'\n]/g, '').trim().toLowerCase();
  return CATEGORIES.find((c) => c.toLowerCase() === cleaned) ?? null;
}

/**
 * Classifies an inbound reply's sentiment so Dean can triage which of
 * today's replies to answer first instead of reading them cold. Reuses the
 * same free-provider chain as the AI email writer — this is a tiny,
 * cheap classification call, so it's very unlikely to exhaust any of them.
 *
 * @returns {Promise<string|null>} one of CATEGORIES, or null if every provider failed/returned junk.
 */
async function classifyReply(snippet, businessName, keys) {
  if (!snippet?.trim()) return null;
  const prompt = buildPrompt(snippet.slice(0, 500), businessName);

  const providers = [
    { key: keys?.gemini, run: () => classifyWithGemini(prompt, keys.gemini) },
    { key: keys?.groq, run: () => classifyWithOpenAiCompatible(prompt, keys.groq, { baseUrl: 'https://api.groq.com/openai/v1', model: 'meta-llama/llama-4-scout-17b-16e-instruct' }) },
    { key: keys?.mistral, run: () => classifyWithOpenAiCompatible(prompt, keys.mistral, { baseUrl: 'https://api.mistral.ai/v1', model: 'pixtral-12b-2409' }) },
    { key: keys?.openrouter, run: () => classifyWithOpenAiCompatible(prompt, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-12b-v2-vl:free' }) },
    { key: keys?.cerebras, run: () => classifyWithOpenAiCompatible(prompt, keys.cerebras, { baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b' }) },
    { key: keys?.cloudflare, run: () => {
      const [accountId, apiToken] = String(keys.cloudflare).split(':');
      return classifyWithOpenAiCompatible(prompt, apiToken, { baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`, model: '@cf/meta/llama-3.1-8b-fast-v2' });
    } },
    { key: keys?.huggingface, run: () => classifyWithOpenAiCompatible(prompt, keys.huggingface, { baseUrl: 'https://router.huggingface.co/v1', model: 'meta-llama/Llama-3.1-8B-Instruct' }) },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const category = normalizeCategory(await provider.run());
      if (category) return category;
    } catch { /* try next provider */ }
  }
  return null;
}

module.exports = { classifyReply };
