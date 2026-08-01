'use strict';

const axios = require('axios');

// Writes a Reddit-native "success story / lessons learned" post — the
// format that actually works on subreddits like r/Freelancers, r/webdev,
// r/smallbusiness (hook -> story -> problem -> what worked -> lesson ->
// low-key "happy to answer questions" close). Reddit communities ban/remove
// posts that read as thinly-veiled ads, so the generated post must NEVER
// include a link, a "DM me", or any direct pitch — the whole point is to
// read as a genuine post someone would upvote, not outreach in disguise.
//
// Only ever writes from facts Dean actually supplies (topic + key points) —
// never invents specific numbers, client names, or outcomes not given,
// same principle as every other generator in this app.

function parseModelJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.title !== 'string' || !parsed.title.trim()) return null;
  if (typeof parsed.body !== 'string' || !parsed.body.trim()) return null;
  return { title: parsed.title.trim(), body: parsed.body.trim() };
}

function buildRedditPostPrompt({ topic, keyPoints, subreddit, myName }) {
  const pointsBlock = (keyPoints ?? []).filter(Boolean).map((p) => `- ${p}`).join('\n');

  return `You are ${myName || 'Dean'}, a freelance web developer, writing a genuine Reddit post${subreddit ? ` for ${subreddit}` : ''} in the "success story / lessons learned" style that actually performs well on subreddits like r/Freelancers, r/webdev and r/smallbusiness.

TOPIC: ${topic}

REAL FACTS TO BUILD THE POST FROM (use ONLY these — never invent a specific number, client name, income figure or outcome that isn't listed here; if something isn't given, keep that part general rather than making something up):
${pointsBlock || '(no specific facts given — keep the post general and about the process/lesson, not fabricated results)'}

STRUCTURE:
1. TITLE — curiosity-driven, first-person, specific (e.g. "How I did X" / "I tried X so you don't have to" / "X taught me Y") — not clickbait, just genuinely interesting.
2. OPENING — 1-2 sentences of real context/struggle that hooks the reader, first person.
3. BODY — the actual story or process, broken into short paragraphs or numbered steps if it's a how-to. Concrete, specific, grounded only in the facts given above.
4. LESSON — a genuine takeaway or reflection, not a sales line.
5. CLOSE — low-key, e.g. "Happy to answer questions" or "Curious if others have found the same" — an invitation to discuss, nothing else.

BANNED — these get posts removed/downvoted on Reddit and must never appear:
- No links, no "DM me", no "check out my website/services", no pricing, no CTA to hire you or contact you. This is a story post, not an ad — the value IS the post itself.
- No marketing language ("game-changing", "revolutionary", "unlock"), no emojis, no hashtags.
- No corporate tone — plain, conversational, first person, like a real Redditor typed it.
- Do not invent stats, client names, or outcomes not given in the facts above.

Respond with ONLY a JSON object: {"title": "...", "body": "..."}`;
}

async function generateWithGemini(prompt, apiKey) {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } },
    { timeout: 20_000 },
  );
  return parseModelJson(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function generateWithOpenAiCompatible(prompt, apiKey, { baseUrl, model }) {
  const { data } = await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } },
    { timeout: 20_000, headers: { Authorization: `Bearer ${apiKey}` } },
  );
  return parseModelJson(data.choices?.[0]?.message?.content);
}

async function runProviderChain(prompt, keys) {
  const providers = [
    { key: keys?.cerebras, run: () => generateWithOpenAiCompatible(prompt, keys.cerebras, { baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b' }) },
    { key: keys?.groq, run: () => generateWithOpenAiCompatible(prompt, keys.groq, { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }) },
    { key: keys?.gemini, run: () => generateWithGemini(prompt, keys.gemini) },
    { key: keys?.mistral, run: () => generateWithOpenAiCompatible(prompt, keys.mistral, { baseUrl: 'https://api.mistral.ai/v1', model: 'pixtral-12b-2409' }) },
    { key: keys?.openrouter, run: () => generateWithOpenAiCompatible(prompt, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-12b-v2-vl:free' }) },
    { key: keys?.huggingface, run: () => generateWithOpenAiCompatible(prompt, keys.huggingface, { baseUrl: 'https://router.huggingface.co/v1', model: 'meta-llama/Llama-3.1-8B-Instruct' }) },
  ];
  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const result = await provider.run();
      if (result) return result;
    } catch (err) {
      console.warn(`[redditPostWriter] provider failed: ${err.response?.data?.error?.message ?? err.message}`);
    }
  }
  return null;
}

/**
 * @param {object} input
 * @param {string} input.topic - what the post is about
 * @param {string[]} [input.keyPoints] - real facts/stats/steps to build from, never invented
 * @param {string} [input.subreddit] - e.g. "r/Freelancers", for tone-fitting only
 * @param {string} [input.myName]
 * @param {object} keys - provider API keys, same shape as growthAuditOutreachWriter.generateGrowthAuditOutreach
 * @returns {Promise<{title: string, body: string}|null>}
 */
async function generateRedditPost(input, keys) {
  const prompt = buildRedditPostPrompt(input);
  return runProviderChain(prompt, keys);
}

module.exports = { generateRedditPost, buildRedditPostPrompt };
