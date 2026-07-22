'use strict';

const axios = require('axios');

// Replaces the crude keyword-scoring pass (still used as a free, instant
// pre-filter to avoid spending AI calls on obviously irrelevant posts) with
// a real judgment call on borderline/plausible candidates: is this person
// actually trying to hire, and what's the right thing to say back to them.
const PROMPT_TEMPLATE = (input) => `You are the Local Intent Intelligence Engine inside a CRM platform.

Your job is to analyze social posts, forum threads, community discussions, review comments, and local conversations and determine whether they represent a real business opportunity for a local service provider.

INPUT
source_platform: ${input.sourcePlatform}
thread_title: ${input.threadTitle}
thread_body: ${input.threadBody || '(no body text available — judge from the title alone)'}
comments: ${input.comments || '(none available)'}
author_name: ${input.authorName || 'unknown'}
author_location: ${input.authorLocation || 'unknown'}
thread_url: ${input.threadUrl}
timestamp: ${input.timestamp || 'unknown'}
target_service_keywords: ${input.targetServiceKeywords}

PRIMARY OBJECTIVE
Identify people who are actively looking for a local service, dissatisfied with a current provider, requesting recommendations, asking for quotes, or describing a problem that a business could solve — specifically around the target_service_keywords above. A post about an unrelated service (e.g. plumbing when target is web design) is not a lead, no matter how strong the buying intent.

TASKS

1. LEAD DETECTION
Determine whether the conversation contains a potential lead.

High-intent examples: "Can anyone recommend…", "Looking for a reliable…", "Need someone to…", "Who do you use for…", "Our current provider is terrible", "Any local company that can help with…", "Need a quote / estimate", "Urgent / ASAP / today / this week".

Ignore: news sharing, general discussion, political debate, meme or joke posts, historical or hypothetical questions, someone advertising their OWN services (a freelancer/agency self-promoting is not a buyer).

2. LOCAL INTENT SCORING
Return a score from 0-100 using these factors:
- Explicit need/request: +30
- Local location mentioned: +20
- Budget/quote request: +20
- Urgency: +15
- Existing provider dissatisfaction: +10
- Decision-maker language ("I need", "my business", "our company"): +5

Interpretation: 80-100 = Hot lead, 60-79 = Warm lead, 40-59 = Monitor, 0-39 = Ignore.

3. EXTRACT STRUCTURED DATA: service_needed, location, urgency, budget_mentioned, competitor_mentioned, decision_maker (true/false), contact_signal (true if the user invites recommendations or contact).

4. WRITE A ONE-SENTENCE SUMMARY
A plain-English summary of the opportunity for a busy business owner skimming a lead list — not a repeat of the post, an assessment of it. E.g. "Potential customer actively looking for a developer and likely ready to discuss pricing."

5. GENERATE A COMMUNITY-SAFE REPLY DRAFT
Create a short, non-spammy reply that acknowledges the person's problem, offers help without aggressive selling, invites a conversation naturally, and matches the tone of the platform.
Rules: no hard sales language, no "DM me now", no fake claims, keep under 80 words, sound like a helpful local business owner (the business owner is a UK-based web/app developer who also runs a booking-platform product called Bookrightly — only mention Bookrightly if the post is specifically about needing online bookings/scheduling, not otherwise).

6. CRM ACTION — choose exactly one of: CREATE_HOT_LEAD, CREATE_WARM_LEAD, MONITOR_THREAD, IGNORE.

IMPORTANT
Optimize for precision over recall. A smaller number of genuine local buying opportunities is more valuable than a large number of weak keyword matches. Prioritize conversations where a person is actively trying to hire, replace, or evaluate a local service provider within the next 30 days.

Respond with ONLY a JSON object in exactly this shape, no other text:
{"lead_detected": true, "intent_score": 87, "lead_temperature": "HOT", "service_needed": "...", "location": "...", "urgency": "...", "budget_mentioned": false, "competitor_mentioned": true, "decision_maker": true, "contact_signal": true, "reasoning": ["...", "..."], "summary": "...", "suggested_reply": "...", "crm_action": "CREATE_HOT_LEAD"}`;

// Models don't always follow the requested shape — confirmed live: a post
// about a structured job listing (its own data had fields literally named
// "developer_preference"/"target") came back with service_needed as that
// nested object instead of a plain string, which crashed the whole app when
// rendered directly in JSX (React error #31, "objects are not valid as a
// React child"). Coerced to strings here so bad shape never reaches
// Firestore in the first place — the frontend also defends against
// already-saved bad data from before this fix (see safeText in
// CodingLeadDetail.jsx).
function coerceToString(value) {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function parseModelJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  const validActions = new Set(['CREATE_HOT_LEAD', 'CREATE_WARM_LEAD', 'MONITOR_THREAD', 'IGNORE']);
  if (!validActions.has(parsed.crm_action)) return null; // malformed/off-spec output — treat as a failed attempt, not a false IGNORE

  for (const key of ['service_needed', 'location', 'urgency', 'summary', 'suggested_reply']) {
    parsed[key] = coerceToString(parsed[key]);
  }
  if (Array.isArray(parsed.reasoning)) {
    parsed.reasoning = parsed.reasoning.map(coerceToString);
  }
  return parsed;
}

async function analyzeWithGemini(prompt, apiKey) {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } },
    { timeout: 20_000 }
  );
  return parseModelJson(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function analyzeWithOpenAiCompatible(prompt, apiKey, { baseUrl, model }) {
  const { data } = await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } },
    { timeout: 20_000, headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return parseModelJson(data.choices?.[0]?.message?.content);
}

/**
 * Runs a candidate post through the Local Intent Intelligence Engine prompt,
 * falling through the same free-tier provider chain used elsewhere in this
 * app. Only ever called for items that already passed the cheap keyword
 * pre-filter (see codingLeadsService.js) — an AI call per RSS/search item
 * scanned would burn through free-tier daily limits fast.
 *
 * @returns {Promise<object|null>} the parsed analysis, or null if every
 *   provider failed (caller falls back to the old keyword-based scoring).
 */
async function analyzeLeadIntent(input, keys) {
  const prompt = PROMPT_TEMPLATE(input);

  const providers = [
    { name: 'gemini', key: keys?.gemini, run: () => analyzeWithGemini(prompt, keys.gemini) },
    // Groq dropped Llama 4 Scout from their catalog entirely (confirmed live
    // against console.groq.com/docs/models — production logs were failing
    // with "does not exist or you do not have access to it"). Switched to
    // llama-3.3-70b-versatile, a currently-listed production text model —
    // this analyzer only needs text, not vision, so the loss of Scout's
    // multimodal capability doesn't matter here (unlike websiteDesignAudit.js
    // and aiEmailWriter.js, which use the same now-dead model name and may
    // need the same live check).
    { name: 'groq', key: keys?.groq, run: () => analyzeWithOpenAiCompatible(prompt, keys.groq, { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }) },
    { name: 'mistral', key: keys?.mistral, run: () => analyzeWithOpenAiCompatible(prompt, keys.mistral, { baseUrl: 'https://api.mistral.ai/v1', model: 'pixtral-12b-2409' }) },
    { name: 'openrouter', key: keys?.openrouter, run: () => analyzeWithOpenAiCompatible(prompt, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-12b-v2-vl:free' }) },
    { name: 'cerebras', key: keys?.cerebras, run: () => analyzeWithOpenAiCompatible(prompt, keys.cerebras, { baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b' }) },
    {
      name: 'cloudflare',
      key: keys?.cloudflare,
      run: () => {
        const [accountId, apiToken] = String(keys.cloudflare).split(':');
        return analyzeWithOpenAiCompatible(prompt, apiToken, { baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`, model: '@cf/meta/llama-3.1-8b-fast-v2' });
      },
    },
    { name: 'huggingface', key: keys?.huggingface, run: () => analyzeWithOpenAiCompatible(prompt, keys.huggingface, { baseUrl: 'https://router.huggingface.co/v1', model: 'meta-llama/Llama-3.1-8B-Instruct' }) },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const result = await provider.run();
      if (result) return result;
    } catch (err) {
      console.warn(`[localIntentAnalyzer] ${provider.name} failed: ${err.response?.data?.error?.message ?? err.message}`);
    }
  }
  return null;
}

module.exports = { analyzeLeadIntent };
