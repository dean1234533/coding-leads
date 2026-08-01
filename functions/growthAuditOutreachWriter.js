'use strict';

const axios = require('axios');
const { buildAuditToolUrl } = require('./growthAuditConfig');

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
  personal_trainer: 'the booking/enquiry journey, trust signals and local visibility',
  barber: 'the mobile booking experience, local search and conversion',
  salon: 'the mobile booking experience, local search and conversion',
  painter_decorator: 'local search, quote enquiries, and trust/gallery signals',
  decorator: 'local search, quote enquiries, and trust/gallery signals',
  painter: 'local search, quote enquiries, and trust/gallery signals',
  restaurant: 'mobile experience, menus, bookings and local visibility',
  clinic: 'trust, bookings, accessibility and local SEO',
  dentist: 'trust, bookings, accessibility and local SEO',
  chiropractor: 'trust, bookings, accessibility and local SEO',
  trades: 'calls, quote enquiries, local SEO and mobile usability',
  plumber: 'calls, quote enquiries, local SEO and mobile usability',
  electrician: 'calls, quote enquiries, local SEO and mobile usability',
  tattoo: 'a clear booking call-to-action, trust signals and mobile experience',
};

// Every generated message must land on one of these CTA shapes, verbatim or
// close to it — variety across generations, but always pointing at the
// tool link as the next step, never "I'll send you the audit".
const CTA_VARIATIONS = [
  'Run your free audit here: {link}',
  'Feel free to run it through here: {link}',
  'You can check it yourself here: {link}',
  'I made it free to use here: {link}',
  'Have a look and see what it picks up: {link}',
];

function describeFindingForPrompt(finding) {
  const hedge = CONFIDENCE_LANGUAGE[finding.measurementType] ?? CONFIDENCE_LANGUAGE.detected;
  return `- [${finding.category}] ${finding.title}\n  What was actually found: ${finding.evidence || finding.description}\n  Confidence: ${finding.measurementType} — ${hedge}`;
}

// Shared context block every prompt gets — who the sender is and what the
// tool actually does, kept factual and un-hyped per the "useful, not
// gimmicky" instruction. Deliberately doesn't say "AI-powered" here; the
// model already has the finding data, it doesn't need to be told to be
// impressed by its own tech.
function toolContextBlock(myName) {
  return `${myName} is a freelance web developer who built Growth Audit, a free website auditing and monitoring tool. It checks websites for SEO, performance, accessibility, mobile usability, local SEO, conversion and trust-signal issues, and can render modern JavaScript websites properly (not just raw HTML) so it catches things a basic scanner would miss. The point of mentioning it is to hand the prospect something genuinely useful they can check for themselves — not to brag about the technology.`;
}

function buildInitialPrompt({ businessName, contactName, industry, channel, myName, findings }) {
  const findingsBlock = findings.map(describeFindingForPrompt).join('\n');
  const focusHint = BUSINESS_TYPE_FOCUS_HINT[String(industry ?? '').toLowerCase().replace(/[\s-]+/g, '_')];
  const link = buildAuditToolUrl(channel);
  const ctaExamples = CTA_VARIATIONS.map((c) => c.replace('{link}', link)).join('\n');

  return `You are ${myName}. ${toolContextBlock(myName)}

You are writing a first outreach message to a local business. This is NOT an advert for your SaaS and it is NOT primarily "I build websites" — it should read like: "I looked at your website, noticed a few things, and built a free tool that lets you check it yourself."

BUSINESS: ${businessName || 'the business'}${contactName ? ` (contact: ${contactName})` : ''}${industry ? `\nINDUSTRY: ${industry}${focusHint ? ` — for this type of business, ${focusHint} tend to matter most, but only lean on that if the findings below actually support it` : ''}` : ''}

REAL FINDINGS FROM THE AUDIT (use ONLY these — never invent or assume anything beyond what's listed, and never mention more than the strongest 1-3):
${findingsBlock}

AUDIT TOOL LINK (use this EXACT link, do not modify it or invent a different one): ${link}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

STRUCTURE to hit (in your own words each time — vary phrasing and sentence order, don't reuse the same patterns message to message):
1. PERSONAL OPENING — mention the business naturally. No generic compliments ("I came across your amazing business" is banned), no "Hope you're well".
2. REAL FINDINGS — reference 1-3 of the findings above, translated into plain English a non-technical business owner understands. Never lead with raw technical terms like "LCP", "DOM", "schema", "meta tag", "viewport" — describe the real-world effect instead. Examples of the translation expected: "Missing viewport meta tag" becomes "your mobile setup has an issue that can affect how the site displays on phones"; "Missing title tag" becomes "some important SEO information is missing from the page"; "Missing CTA" becomes "there isn't a clear next step for visitors who want to book".
3. WHY THEY MATTER — briefly say why this matters in plain English (lost enquiries, visitors leaving, harder to find locally) — only claims the findings actually support. No exaggeration.
4. TOOL INTRODUCTION — mention you built a free website audit tool that checks for things like this and shows the issues and recommended fixes. Don't oversell it or call it "AI-powered"/"revolutionary" — just useful.
5. PRIMARY CTA — send them to the audit tool using the exact link above. Use a CTA in this style (vary which one, don't always pick the first):
${ctaExamples}

BANNED — never do any of these:
- Do not say "I can send you the audit", "would you like me to send the audit/report", or offer to send a PDF. The prospect runs the audit themselves via the link.
- Do not ask "do you want me to build you a website", "can I redesign your site", "would you like a quote", or "book a call" — that offer comes later, not in this message.
- No generic compliments, no "Hope you're well", no "I help businesses like yours".
- No corporate transition words (Furthermore/Additionally/Moreover), no fake urgency, no exclamation marks.
- No "AI-powered", "AI website audit", "revolutionary AI" — say what the tool does, not how impressive the tech is.
- No claims not supported by the findings above.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."} (no subject needed for this channel, leave it as an empty string)'}`;
}

function buildFollowUpPrompt({ businessName, channel, myName, stage }) {
  const link = buildAuditToolUrl(channel);
  const stageGuidance = stage === 2
    ? `This is the FINAL follow-up. Very low-pressure — explicitly say no worries if it's not something they're looking at right now, and leave the audit tool link (${link}) there for whenever they want it. Do not push again after this.`
    : `This is the FIRST follow-up, sent a few days after the original message with no reply. Short, low-pressure nudge pointing back at the free audit tool (${link}) — NOT "just checking if you want me to send the audit".`;

  return `You are ${myName}, writing a short follow-up to ${businessName || 'a business'} who hasn't replied to your earlier message about the free website audit tool you mentioned.

${stageGuidance}

AUDIT TOOL LINK (use this EXACT link): ${link}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Keep it very short (1-3 sentences). No pressure, no guilt-tripping, no fake urgency, no re-explaining the findings in detail — this is a nudge pointing back at the tool, not a new pitch. Never say "checking if you want me to send the audit" — the tool is self-serve, always point them to the link. Vary the wording naturally each time rather than using a fixed template.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."}'}`;
}

function buildSoftPrompt({ businessName, channel, myName, findings }) {
  // Called when the audit came back mostly healthy — genuine minor
  // opportunities only, never manufactured weaknesses. If findings is
  // empty, the prompt below deliberately doesn't ask for any "problem"
  // framing at all.
  const findingsBlock = findings.length > 0 ? findings.map(describeFindingForPrompt).join('\n') : '(none of real significance — the site is in good shape)';
  const link = buildAuditToolUrl(channel);

  return `You are ${myName}. ${toolContextBlock(myName)}

You are writing a light first outreach message to ${businessName || 'a business'}. Their site actually came back healthy from a quick look — do NOT manufacture problems or exaggerate minor findings into big issues.

MINOR FINDINGS (if any — do not oversell these):
${findingsBlock}

AUDIT TOOL LINK (use this EXACT link): ${link}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Write a short, honest, low-key message: acknowledge the site looks in decent shape, mention you built a free website audit tool and thought they might find it useful to run their site through it (out of curiosity, not because you found something alarming), and if there are minor findings, mention them lightly as "a couple of small things" — otherwise just offer the tool link with zero pressure. Point them at the exact link above as the way to see for themselves. This should read as genuinely low-stakes, not a disguised sales pitch. No banned generic compliments, no fake urgency, no "AI-powered" language.

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
 * Generates one Growth-Audit-driven outreach message. The primary CTA is
 * always "run your free audit here: [link]" — this is a self-serve funnel
 * (prospect -> outreach -> audit tool -> they see their own problems ->
 * account if they want to save/monitor -> potential client), not a
 * PDF-send-on-request flow.
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
  CTA_VARIATIONS,
  generateGrowthAuditOutreach,
  buildInitialPrompt,
  buildFollowUpPrompt,
  buildSoftPrompt,
};
