'use strict';

const axios = require('axios');
const { buildAuditToolUrl, PORTFOLIO_URL } = require('./growthAuditConfig');

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

// Word-count ranges, not hard maxima to always hit — shorter is usually
// better (spec: "Do NOT force every message to the maximum length").
const CHANNEL_GUIDANCE = {
  email: 'This is an EMAIL. 150-250 words. No "Dear [Business]," corporate opener, no subject-line fluff. A real subject line is still needed (return it separately).',
  whatsapp: 'This is a WHATSAPP message. 80-150 words, conversational, reads like a text from a real person. No formal sign-off — just "Dean" at the end.',
  instagram: 'This is an INSTAGRAM DM. 60-120 words, casual and short. A relaxed "Hey" or "Hi" opener is fine. No formal sign-off — just "Dean".',
  facebook: 'This is a FACEBOOK MESSENGER DM. 80-150 words, casual "Hi" opener. No formal sign-off — just "Dean".',
  linkedin: 'This is a LINKEDIN message. 80-150 words, professional but still conversational and human — not a corporate pitch.',
};

// Business-type action language for the IMPACT sentence — "make it harder
// for someone to go from X to Y" — only used where it genuinely fits, never
// forced. Kept separate from the old BUSINESS_TYPE_FOCUS_HINT category list
// since this is about how to phrase impact, not which findings to pick
// (that's findingSelector.js's job).
const BUSINESS_TYPE_ACTION_HINT = {
  personal_trainer: 'go from finding your site to booking a session',
  barber: 'go from finding you on Google to booking an appointment',
  salon: 'go from finding you on Google to booking an appointment',
  painter_decorator: 'looking for a quote to get in touch',
  decorator: 'looking for a quote to get in touch',
  painter: 'looking for a quote to get in touch',
  tattoo: 'go from viewing your work to enquiring about an appointment',
  restaurant: 'go from finding you online to booking a table',
  clinic: 'go from finding you online to booking an appointment',
  dentist: 'go from finding you online to booking an appointment',
  chiropractor: 'go from finding you online to booking an appointment',
  trades: 'get in touch about a job',
  plumber: 'get in touch about a job',
  electrician: 'get in touch about a job',
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

// The soft, no-hard-sell way of mentioning web development help — comes
// AFTER the tool/CTA, never before it, and never as a direct ask.
const SERVICE_MENTION_EXAMPLES = [
  "I'm also a web developer, so if you ever want help fixing anything it picks up, that's something I can help with.",
  "If you decide you'd rather have someone take care of the fixes, that's something I can help with as well.",
];

function describeFindingForPrompt(finding) {
  const hedge = CONFIDENCE_LANGUAGE[finding.measurementType] ?? CONFIDENCE_LANGUAGE.detected;
  return `- [${finding.category}] ${finding.title}\n  What was actually found: ${finding.evidence || finding.description}\n  Confidence: ${finding.measurementType} — ${hedge}`;
}

function firstName(myName) {
  return String(myName ?? 'Dean').trim().split(/\s+/)[0] || 'Dean';
}

// Shared identity block every prompt gets. Deliberately factual and
// un-hyped — the model already has the finding data, it doesn't need to be
// told to be impressed by its own tech, and it should never claim to be
// anything other than the actual person who built the tool.
function identityBlock(myName) {
  const first = firstName(myName);
  return `You are ${myName ?? 'Dean Burt'} (goes by "${first}"), a freelance web developer and designer (dean-da-dev.co.uk, dean@dean-da-dev.co.uk). You built Growth Audit, a free website auditing and monitoring tool. It checks websites for performance, conversion, mobile usability, SEO, local SEO, accessibility and trust-signal issues, and can render modern JavaScript websites properly (not just raw HTML) so it catches things a basic scanner would miss.`;
}

function auditIntroSentence() {
  return "Mention that you've actually built a free website audit tool that checks for things like this and gives real findings + recommended fixes — factual, not hyped. Never say \"AI-powered\", \"AI website audit\" or \"revolutionary\".";
}

function buildInitialPrompt({ businessName, contactName, industry, channel, myName, findings, includePortfolio = false, includeScore = false, overallScore }) {
  const capped = (findings ?? []).slice(0, 3);
  const findingsBlock = capped.map(describeFindingForPrompt).join('\n');
  const actionHint = BUSINESS_TYPE_ACTION_HINT[String(industry ?? '').toLowerCase().replace(/[\s-]+/g, '_')];
  const link = buildAuditToolUrl(channel);
  const ctaExamples = CTA_VARIATIONS.map((c) => c.replace('{link}', link)).join('\n');
  const serviceExamples = SERVICE_MENTION_EXAMPLES.join('\n');
  const first = firstName(myName);

  return `${identityBlock(myName)}

You are writing a first outreach message to a local business, ${businessName || 'the business'}${contactName ? ` (contact: ${contactName})` : ''}. This should read like a real person who actually looked at their website, not an automated report and not an advert for your SaaS.

BUSINESS: ${businessName || 'the business'}${industry ? `\nINDUSTRY: ${industry}` : ''}

REAL FINDINGS AVAILABLE (use ONLY these — never invent or assume anything beyond what's listed):
${findingsBlock}

USE 2 OF THESE FINDINGS NORMALLY. Only mention a 3rd if all three are genuinely strong and clearly different from each other — do not force all 3 into every message just because they're available. Never dump a long list of findings; this is a personal note, not an audit report. Be careful with anything inherently subjective (e.g. "no testimonials", "no portfolio", "looks outdated") — only mention it if the evidence genuinely supports it being a real issue; a business may have deliberately chosen not to have that thing, so measurable findings ("takes 9.5 seconds to load") are always stronger than subjective ones ("looks outdated").

AUDIT TOOL LINK (use this EXACT link, do not modify it or invent a different one): ${link}
${includeScore && typeof overallScore === 'number' ? `\nThe site's overall audit score is ${overallScore}/100 — you may mention it if it genuinely helps, but don't lead with it.` : '\nDo NOT mention any numeric audit score in this message — it makes cold outreach feel automated. It is fine (and expected) to mention specific measured findings like load time.'}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

STRUCTURE to hit (in your own words each time — vary phrasing and sentence order, don't reuse the same patterns message to message):
1. GREETING — "Hi ${businessName ? `${businessName} team` : 'there'},"
2. INTRODUCTION — introduce yourself as ${first}, a web developer and designer, and say you came across their website. Example: "I'm ${first}, a web developer and designer, and I came across your website while looking at local businesses." Do NOT start with "I was looking at local businesses in the area..." on its own — ${first} needs to be introduced first, in the same or very next sentence.
3. OBSERVATION — something like "I had a quick look and noticed a few things that caught my attention."
4. FINDINGS — weave in 2 (occasionally 3) real findings from above, translated into plain English a non-technical business owner understands. Never lead with raw technical terms like "LCP", "DOM", "schema", "meta tag", "viewport", "WCAG" — describe the real-world effect instead. Examples: "LCP is 9.5 seconds" becomes "your homepage is taking around 9.5 seconds to load its main content, which can be frustrating for visitors on slower connections"; "Four elements fail WCAG contrast" becomes "some text on the site has low colour contrast, which can make it harder to read for some visitors"; "Missing viewport meta tag" becomes "there's an issue with how the site is configured for mobile devices".
5. IMPACT — briefly explain what this could mean in plain English, proportional to the evidence. Use hedged language: "could make it harder for...", "can affect...", "may be costing you enquiries...". NEVER say "you're losing customers", "you're losing thousands of pounds", "people are definitely leaving", or state anything as certain that isn't.${actionHint ? ` Where it fits naturally, you can frame the impact in terms of the visitor journey — e.g. "...could make it harder for someone to ${actionHint}." — but only if it reads naturally, don't force it.` : ''}
6. TOOL INTRODUCTION — ${auditIntroSentence()}
7. PRIMARY CTA — send them to the audit tool using the exact link above. Use a CTA in this style (vary which one, don't always pick the first):
${ctaExamples}
8. SERVICE MENTION — soft, no hard sell, after the CTA. Use wording close to one of these (vary it):
${serviceExamples}
${includePortfolio && channel === 'email' ? `9. PORTFOLIO — email only, keep it minimal, its own short block near the end, separate from the audit link:\nPortfolio:\n${PORTFOLIO_URL}` : ''}
${channel === 'email' ? `${includePortfolio ? '10' : '9'}. SIGN-OFF — professional signature:\nKind regards,\n\nDean Burt\nWeb Developer & Designer\ndean-da-dev.co.uk\ndean@dean-da-dev.co.uk` : `${includePortfolio ? '10' : '9'}. SIGN-OFF — just "${first}" on its own line, nothing more formal.`}

BANNED — never do any of these:
- Do not open with "I was looking at local businesses in the area...", "I came across your amazing business...", "Hope you're well", "I hope this message finds you", "I wanted to reach out", "I help businesses like yours" — introduce ${first} first instead.
- Do not say "I can send you the audit", "would you like me to send the audit/report", or offer to send a PDF. The prospect runs the audit themselves via the link.
- Do not ask "do you want me to build you a website", "can I redesign your site", "would you like a quote", or "book a call" — that offer comes later, not in this message.
- Do not write a generic sales paragraph like "A working, fast, mobile-friendly website can make a big difference because it allows potential customers to..." — the prospect already knows what a website does. Use evidence from THEIR site instead.
- Do not produce a bullet-point feature list (Find you easily on Google / Contact you instantly / Trust your business / etc.) — this reads like a marketing brochure, not a personal message.
- Do not dump more than 3 findings, and do not present them as a scored report ("Your website scored 71/100" followed by a checklist). The audit tool is where they explore the full findings themselves.
- No corporate transition words (Furthermore/Additionally/Moreover), no fake urgency, no exclamation marks.
- No "AI-powered", "AI website audit", "revolutionary AI" — say what the tool does, not how impressive the tech is.
- No claims not supported by the findings above.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."} (no subject needed for this channel, leave it as an empty string)'}`;
}

function buildFollowUpPrompt({ businessName, channel, myName, stage }) {
  const link = buildAuditToolUrl(channel);
  const first = firstName(myName);
  const stageGuidance = stage === 2
    ? `This is the FINAL, lowest-pressure follow-up. Example shape (vary wording): "Just leaving this here in case it's useful:\n\n${link}\n\nIt's completely free to run your website through the audit.\n\nAll the best,\n${first}". Do not push again after this.`
    : `This is the FIRST follow-up, sent a few days after the original message with no reply. Example shape (vary wording): "Hi [Name], just following up on my message about your website. I spotted a couple of things worth looking at and built a free audit tool that lets you check them yourself:\n\n${link}\n\nNo pressure at all — thought it might be useful." Never say "just checking if you want me to send the audit" — the tool is self-serve, always point them to the link.`;

  return `You are ${first}, writing a short follow-up to ${businessName || 'a business'} who hasn't replied to your earlier message about the free website audit tool you mentioned.

${stageGuidance}

AUDIT TOOL LINK (use this EXACT link): ${link}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Keep it very short (1-3 sentences plus the link). No pressure, no guilt-tripping, no fake urgency, no re-explaining the findings in detail — this is a nudge pointing back at the tool, not a new pitch. Vary the wording naturally each time rather than using a fixed template.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."}'}`;
}

function buildSoftPrompt({ businessName, channel, myName, findings }) {
  // Called when the audit came back mostly healthy — genuine minor
  // opportunities only, never manufactured weaknesses. If findings is
  // empty, the prompt below deliberately doesn't ask for any "problem"
  // framing at all.
  const capped = (findings ?? []).slice(0, 2);
  const findingsBlock = capped.length > 0 ? capped.map(describeFindingForPrompt).join('\n') : '(none of real significance — the site is in good shape)';
  const link = buildAuditToolUrl(channel);
  const first = firstName(myName);

  return `${identityBlock(myName)}

You are writing a light first outreach message to ${businessName || 'a business'}. Introduce yourself as ${first}, a web developer and designer, the same way as normal outreach — their site actually came back healthy from a quick look, so do NOT manufacture problems or exaggerate minor findings into big issues.

MINOR FINDINGS (if any — do not oversell these, mention at most 1-2 lightly):
${findingsBlock}

AUDIT TOOL LINK (use this EXACT link): ${link}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Write a short, honest, low-key message: introduce yourself, acknowledge the site looks in decent shape, mention you built a free website audit tool and thought they might find it useful to run their site through it (out of curiosity, not because you found something alarming), and if there are minor findings, mention them lightly as "a couple of small things" — otherwise just offer the tool link with zero pressure. Point them at the exact link above as the way to see for themselves. This should read as genuinely low-stakes, not a disguised sales pitch. Do not open with "I was looking at local businesses in the area...". No banned generic compliments, no fake urgency, no "AI-powered" language, no bullet-point feature lists.

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
 * Generates one Growth-Audit-driven outreach message. Should read like Dean
 * personally looked at the prospect's site, not like an automated audit
 * report: introduce Dean, mention 2-3 real findings translated into plain
 * English, point at the free audit tool as the primary CTA, and only softly
 * mention web development help afterwards.
 *
 * @param {object} input
 * @param {string} input.businessName
 * @param {string} [input.contactName]
 * @param {string} [input.industry]
 * @param {string} input.channel - one of CHANNELS
 * @param {string} input.myName
 * @param {object[]} input.findings - from findingSelector.selectTopFindings(...).findings
 * @param {'initial'|'followup1'|'followup2'|'soft'} [input.mode]
 * @param {boolean} [input.includePortfolio] - email only, off by default
 * @param {boolean} [input.includeScore] - off by default
 * @param {number} [input.overallScore]
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
      includePortfolio: !!input.includePortfolio && channel === 'email',
      includeScore: !!input.includeScore,
      overallScore: input.overallScore,
    });
  }

  return runProviderChain(prompt, keys);
}

module.exports = {
  CHANNELS,
  CTA_VARIATIONS,
  SERVICE_MENTION_EXAMPLES,
  generateGrowthAuditOutreach,
  buildInitialPrompt,
  buildFollowUpPrompt,
  buildSoftPrompt,
};
