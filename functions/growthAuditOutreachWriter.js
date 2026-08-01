'use strict';

const axios = require('axios');

const CHANNELS = ['email', 'whatsapp', 'instagram', 'facebook', 'linkedin'];

// Confidence -> how directly the language can state a finding as fact.
// NOTE: findings passed into this module come from findingSelector.js,
// which only ever draws from audit.recommendations — the Growth Audit
// product already excludes not_applicable/not_verified checks from that
// list entirely (see runFullAudit.ts's failedChecks filter), so a
// not_verified finding structurally can never reach this generator. This
// hedging is for the remaining real distinction: measured vs detected vs
// inferred, all of which ARE genuine findings, just with different
// confidence in exactly how they were determined.
const CONFIDENCE_LANGUAGE = {
  measured: 'This was directly measured, so you can state it plainly as fact (e.g. "takes 3.2 seconds to load").',
  detected: 'This was detected from the page, so state it as an observation ("I noticed..." / "It looks like...") rather than an absolute, but it\'s still a real, specific finding — not a guess.',
  inferred: 'This was inferred rather than directly observed — hedge it clearly ("it looks like this might...", "this could suggest...") rather than stating it as settled fact.',
  not_available: 'Treat this as a general observation only — do not state specifics with confidence.',
};

const CHANNEL_GUIDANCE = {
  email: 'This is an EMAIL. Short — 4-6 sentences across 2-3 short paragraphs, no subject-line fluff, no "Dear [Business]," corporate opener. A real subject line is still needed (return it separately).',
  whatsapp: 'This is a WHATSAPP message. ONE short message, 2-4 sentences, no paragraph breaks, no formal sign-off. Reads like a text from a person.',
  instagram: 'This is an INSTAGRAM DM. Casual and short, 2-4 sentences. A relaxed "Hey" or "Hi" opener is fine. No formal sign-off.',
  facebook: 'This is a FACEBOOK MESSENGER DM. Short, 2-4 sentences, casual "Hi" opener, no formal sign-off.',
  linkedin: 'This is a LINKEDIN message. Professional but still conversational and human — not a corporate pitch. 3-5 sentences.',
};

const BUSINESS_TYPE_FOCUS_HINT = {
  personal_trainer: 'bookings, enquiries, trust signals and local visibility',
  barber: 'bookings, mobile experience, local search and conversion',
  salon: 'bookings, mobile experience, local search and conversion',
  painter_decorator: 'local search, quote enquiries, gallery/trust signals and calls',
  decorator: 'local search, quote enquiries, gallery/trust signals and calls',
  painter: 'local search, quote enquiries, gallery/trust signals and calls',
  restaurant: 'mobile experience, menus, bookings and local visibility',
  clinic: 'trust, bookings, accessibility and local SEO',
  dentist: 'trust, bookings, accessibility and local SEO',
  chiropractor: 'trust, bookings, accessibility and local SEO',
  trades: 'calls, quote enquiries, local SEO and mobile usability',
  plumber: 'calls, quote enquiries, local SEO and mobile usability',
  electrician: 'calls, quote enquiries, local SEO and mobile usability',
};

function describeFindingForPrompt(finding) {
  const hedge = CONFIDENCE_LANGUAGE[finding.measurementType] ?? CONFIDENCE_LANGUAGE.detected;
  return `- [${finding.category}] ${finding.title}\n  What was actually found: ${finding.evidence || finding.description}\n  Confidence: ${finding.measurementType} — ${hedge}`;
}

function buildInitialPrompt({ businessName, contactName, industry, channel, myName, findings }) {
  const findingsBlock = findings.map(describeFindingForPrompt).join('\n');
  const focusHint = BUSINESS_TYPE_FOCUS_HINT[String(industry ?? '').toLowerCase().replace(/[\s-]+/g, '_')];

  return `You are ${myName}, a freelance web developer. You are writing cold outreach to a local business after running their website through your Growth Audit tool — a real scanner that measures actual performance, SEO, mobile, accessibility and conversion signals. You are NOT positioning yourself primarily as "a web developer who builds websites" — you are positioning yourself as someone who FINDS real problems costing businesses potential customers online, and can fix them. The website/audit tool is the primary product; you personally can fix what it finds.

BUSINESS: ${businessName || 'the business'}${contactName ? ` (contact: ${contactName})` : ''}${industry ? `\nINDUSTRY: ${industry}${focusHint ? ` — for this type of business, ${focusHint} tend to matter most, but only lean on that if the findings below actually support it` : ''}` : ''}

REAL FINDINGS FROM THE AUDIT (use ONLY these — never invent or assume anything beyond what's listed):
${findingsBlock}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

STRUCTURE to hit (in your own words each time — vary phrasing, don't reuse the same sentence patterns message to message):
1. OPENING — mention the business naturally, no generic compliments ("I came across your amazing business" is banned), no "Hope you're well".
2. OBSERVATION — mention 1-3 of the findings above, translated into plain English a non-technical business owner understands. Never use raw technical terms like "LCP" or "schema" — describe the real-world effect instead (e.g. instead of "LCP is above threshold" say the homepage takes a while to load, particularly on mobile, which can cause people to leave before it's even loaded).
3. IMPACT — briefly say why this costs them real business (lost enquiries, visitors leaving, lower local visibility) — only claims the findings actually support.
4. VALUE — mention you ran a quick audit and can send over the full findings and recommendations.
5. CTA — low-pressure. The ask is "I can send you the full audit" — NOT "book a call", NOT "buy a website", NOT any payment ask. The goal of this message is just to get a reply.

BANNED PHRASES: "Hope you're well", "I came across your amazing business", "I help businesses like yours", "Would you be interested in a website?", any generic compliment that could apply to any business, corporate transition words (Furthermore/Additionally/Moreover), fake urgency, exclamation marks, claims not supported by the findings above.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."} (no subject needed for this channel, leave it as an empty string)'}`;
}

function buildFollowUpPrompt({ businessName, channel, myName, stage }) {
  const stageGuidance = stage === 2
    ? 'This is the FINAL follow-up. Very low-pressure — explicitly say no worries if it\'s not something they\'re looking at right now, and leave the door open for later. Do not push again after this.'
    : 'This is the FIRST follow-up, sent a few days after the original message with no reply. Short, low-pressure, just a gentle nudge referencing that you found some things worth fixing and can send the audit over if useful.';

  return `You are ${myName}, a freelance web developer, writing a short follow-up to ${businessName || 'a business'} who hasn't replied to your earlier message about the website audit you ran on their site.

${stageGuidance}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Keep it very short (1-3 sentences). No pressure, no guilt-tripping, no fake urgency, no re-explaining the findings in detail — this is a nudge, not a new pitch. Vary the wording naturally each time rather than using a fixed template.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."}'}`;
}

function buildSoftPrompt({ businessName, channel, myName, findings }) {
  // Called when the audit came back mostly healthy — genuine minor
  // opportunities only, never manufactured weaknesses. If findings is
  // empty, the prompt below deliberately doesn't ask for any "problem"
  // framing at all.
  const findingsBlock = findings.length > 0 ? findings.map(describeFindingForPrompt).join('\n') : '(none of real significance — the site is in good shape)';

  return `You are ${myName}, a freelance web developer, writing a light cold outreach message to ${businessName || 'a business'} after running their website through your Growth Audit tool. Their site actually came back healthy — do NOT manufacture problems or exaggerate minor findings into big issues.

MINOR FINDINGS (if any — do not oversell these):
${findingsBlock}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Write a short, honest, low-key message: acknowledge the site is in decent shape, mention you ran it through your audit tool out of curiosity/as a courtesy, and if there are minor findings, mention them lightly as "a couple of small things" — otherwise just offer to send the full report if they're curious, with zero pressure. This should read as genuinely low-stakes, not a disguised sales pitch. No banned generic compliments, no fake urgency.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."}'}`;
}

function parseModelJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.body !== 'string' || !parsed.body.trim()) return null;
  return { subject: typeof parsed.subject === 'string' ? parsed.subject : '', body: parsed.body.trim() };
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
      console.warn(`[growthAuditOutreachWriter] provider failed: ${err.response?.data?.error?.message ?? err.message}`);
    }
  }
  return null;
}

/**
 * Generates one Growth-Audit-driven outreach message.
 *
 * @param {object} input
 * @param {string} input.businessName
 * @param {string} [input.contactName]
 * @param {string} [input.industry]
 * @param {string} input.channel - one of CHANNELS
 * @param {string} input.myName
 * @param {object[]} input.findings - from findingSelector.selectTopFindings(...).findings
 * @param {'initial'|'followup1'|'followup2'|'soft'} [input.mode]
 * @param {object} keys - provider API keys, same shape as aiCommsAssistant.aiKeysFromEnv()
 * @returns {Promise<{subject: string, body: string}|null>}
 */
async function generateGrowthAuditOutreach(input, keys) {
  const channel = CHANNELS.includes(input.channel) ? input.channel : 'email';
  const mode = input.mode ?? 'initial';

  let prompt;
  if (mode === 'followup1' || mode === 'followup2') {
    prompt = buildFollowUpPrompt({ businessName: input.businessName, channel, myName: input.myName, stage: mode === 'followup2' ? 2 : 1 });
  } else if (mode === 'soft') {
    prompt = buildSoftPrompt({ businessName: input.businessName, channel, myName: input.myName, findings: input.findings ?? [] });
  } else {
    prompt = buildInitialPrompt({
      businessName: input.businessName,
      contactName: input.contactName,
      industry: input.industry,
      channel,
      myName: input.myName,
      findings: input.findings ?? [],
    });
  }

  return runProviderChain(prompt, keys);
}

module.exports = {
  CHANNELS,
  generateGrowthAuditOutreach,
  buildInitialPrompt,
  buildFollowUpPrompt,
  buildSoftPrompt,
};
