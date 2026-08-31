'use strict';

const axios = require('axios');
const { PRODUCT_URL } = require('./growthAuditConfig');
const { CHANNEL_WORD_LIMITS } = require('./outreachQuality');

const CHANNELS = ['email', 'whatsapp', 'instagram', 'facebook', 'linkedin'];

// Set by outreachWebsiteAudit.js when the lead's "website" is actually just
// an Instagram/Facebook page — there is no real site behind it, so the
// pitch has to open with "you don't have a website" rather than referencing
// a specific technical finding on one.
const NO_WEBSITE_FINDING_ID = 'identity.socialOnly';
function hasNoRealWebsite(findings) {
  return (findings ?? []).some((f) => f.id === NO_WEBSITE_FINDING_ID);
}

// Confidence -> how directly the language can state a finding as fact.
// NOTE: findings passed into this module come from findingSelector.js,
// which only ever draws from audit.recommendations. This hedging is for
// the real distinction: measured vs detected vs inferred, all of which ARE
// genuine findings, just with different confidence in exactly how they
// were determined.
const CONFIDENCE_LANGUAGE = {
  measured: 'This was directly measured, so you can state it plainly as fact (e.g. "takes 3.2 seconds to load").',
  detected: 'This was detected from the page, so state it as an observation ("I noticed..." / "It looks like...") rather than an absolute, but it\'s still a real, specific finding — not a guess.',
  inferred: 'This was inferred rather than directly observed — hedge it clearly ("it looks like this might...", "this could suggest...") rather than stating it as settled fact.',
  not_available: 'Treat this as a general observation only — do not state specifics with confidence.',
};

// Word-count ranges, not hard maxima to always hit — shorter is usually
// better (spec: "Do NOT force every message to the maximum length").
// Subject-line guidance kept separate from CHANNEL_GUIDANCE.email so it's
// easy to find/tune on its own — this is the single biggest lever on
// whether the email gets opened at all, so it gets real instruction rather
// than just "no fluff".
const SUBJECT_LINE_GUIDANCE = `SUBJECT LINE — this decides whether the email gets opened at all, so treat it as seriously as the body:
- Specific and curiosity-driving, grounded in something real (the business name, or a genuine finding) — never generic ("Quick question", "Following up", "Hello").
- Short: aim for 30-50 characters, definitely under 60 — long subjects get cut off in the inbox preview.
- Sounds like a real person wrote it, not a marketing team — lowercase-ish, conversational, no title case ("A Quick Idea For Your Business" is wrong).
- No spam-trigger words or punctuation: no "free" as the first word, no ALL CAPS, no exclamation marks, no emoji.
- Personalise with the business name where it fits naturally, but don't force it into every subject.
- Vary the phrasing each time rather than reusing the same template — a few shapes that work: naming the specific thing you noticed, a direct question, or a short benefit-led statement.`;

// "Aim for X words" reads to a model as a soft target, not a ceiling — it
// routinely overshoots it. Stating the exact number tied to
// outreachQuality.js's CHANNEL_WORD_LIMITS (so the instruction and the
// automated gate that actually enforces it can never drift apart), framed
// as a hard limit the message gets rejected for exceeding, measurably
// improves compliance versus a vague target range alone.
function hardWordLimitLine(channel, targetFloor) {
  const ceiling = CHANNEL_WORD_LIMITS[channel];
  return `Aim for around ${targetFloor} words. ${ceiling} words is a HARD LIMIT, not a target — a message over ${ceiling} words fails an automated check and gets rejected outright. Count roughly as you write; if you're near the limit, cut a sentence rather than run over it.`;
}

const CHANNEL_GUIDANCE = {
  email: `This is an EMAIL. ${hardWordLimitLine('email', 90)} No "Dear [Business]," corporate opener. A real subject line is still needed (return it separately).\n\n${SUBJECT_LINE_GUIDANCE}`,
  whatsapp: `This is a WHATSAPP message. ${hardWordLimitLine('whatsapp', 60)} Conversational, like a real text. No formal sign-off — just "Dean".`,
  instagram: `This is an INSTAGRAM DM. ${hardWordLimitLine('instagram', 55)} Casual and short. No formal sign-off — just "Dean".`,
  facebook: `This is a FACEBOOK MESSENGER DM. ${hardWordLimitLine('facebook', 65)} Casual and direct. No formal sign-off — just "Dean".`,
  linkedin: `This is a LINKEDIN message. ${hardWordLimitLine('linkedin', 65)} Professional but conversational — not a corporate pitch.`,
};

// Business-type action language for the OBSERVATION/impact sentence —
// "make it harder for someone to go from X to Y" — only used where it
// genuinely fits, never forced. Kept separate from findingSelector.js's
// business-type category weighting since this is about how to phrase
// impact, not which findings to pick.
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
// product link as the next step.
const CTA_VARIATIONS = [
  'You can have a look here: {link}',
  'Take a look here: {link}',
  'Here\'s what it could look like: {link}',
  'You can see it here: {link}',
  'Have a look and see what you think: {link}',
];

function describeFindingForPrompt(finding) {
  const hedge = CONFIDENCE_LANGUAGE[finding.measurementType] ?? CONFIDENCE_LANGUAGE.detected;
  // outreachText (set by outreachWebsiteAudit.js's lightweight analyzer) is a
  // pre-written, already-natural-language phrasing of the finding — prefer it
  // over the more technical evidence/description strings when present.
  const detail = finding.outreachText || finding.evidence || finding.description;
  return `- [${finding.category}] ${finding.title}\n  What was actually found: ${detail}\n  Confidence: ${finding.measurementType} — ${hedge}`;
}

function firstName(myName) {
  return String(myName ?? 'Dean').trim().split(/\s+/)[0] || 'Dean';
}

// Shared identity fact every prompt gets. Deliberately factual and un-hyped
// — the model already has the finding data, it doesn't need to be told to
// be impressed by its own product, and it should never claim to be anything
// other than the actual person reaching out.
function baseIdentityFact(myName) {
  const first = firstName(myName);
  return `You are ${myName ?? 'Dean Burt'} (goes by "${first}"), a web developer and the founder of Bookrightly (bookrightly.co.uk, info@bookrightly.co.uk).`;
}

// What Bookrightly actually is — kept as one canonical description so every
// prompt below explains it the same real way, not a different pitch each
// time. Website + booking system in one, for small businesses that don't
// have their own online presence or a way to take bookings without phone
// calls/messages.
const PRODUCT_DESCRIPTION = 'Bookrightly gives small businesses their own professional website and online booking system in one place — so customers can find out about the business, view services, book online and pay a deposit, without everything having to go through calls or messages.';

function productIntroInstruction() {
  return `Explain what Bookrightly does in your own words, close to: "${PRODUCT_DESCRIPTION}" — factual, not hyped, never "AI-powered" or "revolutionary".`;
}

// A single unified structure covers both scenarios below (no real website
// at all vs. a real website with a genuine technical finding) — the pitch,
// product description, and CTA are identical either way; only what gets
// noticed in step 3 differs. Kept as one function (branching on
// hasNoWebsite) rather than two, since duplicating this much shared
// structure for one differing paragraph was actively making the two drift
// out of sync whenever one got edited and not the other.
function buildInitialPrompt({ businessName, contactName, industry, channel, myName, findings, includeScore = false, overallScore }) {
  const noWebsite = hasNoRealWebsite(findings);
  const capped = (findings ?? []).filter((f) => f.id !== NO_WEBSITE_FINDING_ID).slice(0, 3);
  const findingsBlock = capped.map(describeFindingForPrompt).join('\n');
  const socialFinding = (findings ?? []).find((f) => f.id === NO_WEBSITE_FINDING_ID);
  const noWebsiteDetail = socialFinding?.outreachText
    || 'the link listed for this business actually goes to a social media page (Instagram or Facebook), not a real website';
  const ctaExamples = CTA_VARIATIONS.map((c) => c.replace('{link}', PRODUCT_URL)).join('\n');
  const actionHint = BUSINESS_TYPE_ACTION_HINT[String(industry ?? '').toLowerCase().replace(/[\s-]+/g, '_')];
  const first = firstName(myName);

  return `${baseIdentityFact(myName)}

You are writing a first outreach message to a local business, ${businessName || 'the business'}${contactName ? ` (contact: ${contactName})` : ''}. This should read like a real person who noticed something real about their online presence, not an automated report and not a hard sales pitch. You are NOT writing this message as a report generated by any tool — you (Dean) personally had a quick look at their site yourself. Never say "I ran your site through it/a tool/a scanner" or claim any automated audit produced these findings.

BUSINESS: ${businessName || 'the business'}${industry ? `\nINDUSTRY: ${industry}` : ''}

${noWebsite
    ? `WHAT WAS FOUND (use this, don't invent anything beyond it): this business does not have a real website — ${noWebsiteDetail}`
    : `REAL FINDINGS AVAILABLE (use ONLY these — never invent or assume anything beyond what's listed):\n${findingsBlock || '(no specific technical finding — open on the general observation that a proper website + online booking would help this business)'}\n\nUSE THE SINGLE STRONGEST FINDING NORMALLY. Mention a second only when it is clearly different, highly relevant, and still keeps the message inside the channel limit. Never use a third. Prefer measurable evidence over subjective observations.`}
${includeScore && typeof overallScore === 'number' ? `\nThe site's overall score is ${overallScore}/100 — you may mention it if it genuinely helps, but don't lead with it.` : '\nDo NOT mention any numeric score in this message — it makes cold outreach feel automated.'}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

STRUCTURE to hit (in your own words each time — vary phrasing and sentence order, don't reuse the same patterns message to message):
${channel === 'email' ? `1. GREETING — "Hi ${businessName ? `${businessName} team` : 'there'},"
2. INTRODUCTION — introduce yourself as ${first}, a web developer and the founder of Bookrightly. Example: "I'm ${first} — a web developer and founder of Bookrightly." Do NOT start with "I was looking at local businesses in the area..." on its own — ${first} needs to be introduced first, in the same or very next sentence.
3. OBSERVATION — ${noWebsite ? 'mention factually, without judgement, that they don\'t currently have their own website, so you thought you\'d reach out.' : `state one specific finding in plain English with its practical effect. Never lead with jargon such as LCP, DOM, schema, viewport, or WCAG. Use hedged language for impact — "could make it harder for...", "may be costing you enquiries..." — never state anything as certain that isn't, and never say "you're losing customers" or "you're losing thousands of pounds".${actionHint ? ` Where it fits naturally, you can frame the impact in terms of the visitor journey — e.g. "...could make it harder for someone to ${actionHint}." — but only if it reads naturally, don't force it.` : ''}`}
4. WHAT BOOKRIGHTLY IS — ${productIntroInstruction()}
5. SOFT OFFER — say you'd be happy to show them what it could look like for their business (or similar — you're currently helping local businesses get set up).
6. CTA — point them at Bookrightly using the exact link below. Use a CTA in this style (vary which one, don't always pick the first):
${ctaExamples}
7. CLOSE — a short, direct, low-pressure question like "Would you be interested?" — not a hard CTA, not fake urgency.
8. SIGN-OFF — \nThanks,\n\nDean\nFounder, Bookrightly` : `This channel has a tight word limit — keep every beat below to ONE short sentence, combined where natural, not a separate paragraph each:
1. GREETING + INTRODUCTION — "Hi," introduce yourself as ${first}, a web developer and founder of Bookrightly, in the same sentence or the next one. Do NOT start with "I was looking at local businesses in the area..." on its own.
2. OBSERVATION — ONE sentence: ${noWebsite ? 'mention that they don\'t currently have their own website.' : 'state the single strongest finding in plain English, hedged appropriately, never "you\'re losing customers".'}
3. WHAT BOOKRIGHTLY IS + OFFER — ONE sentence combining what Bookrightly does (website + online booking in one place) with an offer to show them what it could look like.
4. CTA — point them at Bookrightly using the exact link below, and close with a short question like "Would you be interested?". Use a CTA in this style (vary which one):
${ctaExamples}
5. SIGN-OFF — just "${first}" on its own line, nothing more formal.`}

PRODUCT LINK (use this EXACT link, do not modify it or invent a different one): ${PRODUCT_URL}

BANNED — never do any of these:
- Do not open with "I was looking at local businesses in the area...", "I came across your amazing business...", "Hope you're well", "I hope this message finds you", "I wanted to reach out", "I help businesses like yours" — introduce ${first} first instead.
- Do not write a generic sales paragraph like "A working, fast, mobile-friendly website can make a big difference because it allows potential customers to..." — the prospect already knows what a website does. Use what was actually found instead.
- Do not produce a bullet-point feature list (Find you easily on Google / Contact you instantly / Trust your business / etc.) — this reads like a marketing brochure, not a personal message.
- Do not dump more than 3 findings, and do not present them as a scored report ("Your website scored 71/100" followed by a checklist).
- No corporate transition words (Furthermore/Additionally/Moreover), no fake urgency, no exclamation marks.
- No "AI-powered", "revolutionary", "game-changing" — say what Bookrightly does, not how impressive the tech is.
- No claims not supported by what was actually found.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."} (no subject needed for this channel, leave it as an empty string)'}`;
}

function buildFollowUpPrompt({ businessName, channel, myName, stage, findings }) {
  const first = firstName(myName);
  const noWebsite = hasNoRealWebsite(findings);
  const openingContext = noWebsite
    ? `who hasn't replied to your earlier message about setting them up with a website and online booking through Bookrightly (they don't currently have a website — their online presence is a social media page)`
    : `who hasn't replied to your earlier message about Bookrightly`;

  const stageGuidance = stage === 2
    ? `This is the FINAL, lowest-pressure follow-up. Example shape (vary wording): "Just leaving this here in case it's still useful — happy to show ${businessName || 'you'} what Bookrightly could look like whenever you like, no pressure either way.\n\n${PRODUCT_URL}\n\nAll the best,\n${first}". Do not push again after this.`
    : `This is the FIRST follow-up, sent a few days after the original message with no reply. Example shape (vary wording): "Hi, just following up on my earlier message — still happy to show ${businessName || 'you'} what Bookrightly could look like if that's of interest, no obligation at all.\n\n${PRODUCT_URL}" `;

  return `You are ${first}, writing a short follow-up to ${businessName || 'a business'} ${openingContext}.

${stageGuidance}

PRODUCT LINK (use this EXACT link): ${PRODUCT_URL}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Keep it very short (1-3 sentences plus the link). No pressure, no guilt-tripping, no fake urgency, no re-explaining what Bookrightly does in detail — this is a light nudge, not a new pitch. Vary the wording naturally each time rather than using a fixed template.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."}'}`;
}

function buildSoftPrompt({ businessName, channel, myName, findings }) {
  // Called when the lead's site is already in decent shape and/or has no
  // strong finding to open on — genuine minor opportunities only, never
  // manufactured weaknesses. Still offers Bookrightly, just without leaning
  // on a problem to justify it.
  const capped = (findings ?? []).filter((f) => f.id !== NO_WEBSITE_FINDING_ID).slice(0, 2);
  const findingsBlock = capped.length > 0 ? capped.map(describeFindingForPrompt).join('\n') : '(none of real significance — the site is in good shape)';
  const first = firstName(myName);

  return `${baseIdentityFact(myName)}

You are writing a light first outreach message to ${businessName || 'a business'}. Introduce yourself as ${first}, a web developer and the founder of Bookrightly, the same way as normal outreach — their site is already in reasonable shape, so do NOT manufacture problems or exaggerate minor findings into big issues.

MINOR FINDINGS (if any — do not oversell these, mention at most 1-2 lightly, or skip straight to the product if none are worth mentioning):
${findingsBlock}

WHAT BOOKRIGHTLY IS — ${productIntroInstruction()}

PRODUCT LINK (use this EXACT link): ${PRODUCT_URL}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Write a short, honest, low-key message: introduce yourself, acknowledge the site looks in decent shape, and mention Bookrightly as something that might still be useful for taking bookings online (out of curiosity/usefulness, not because you found something alarming). Point them at the exact link above with zero pressure, and close with a short, direct question like "Would you be interested?". This should read as genuinely low-stakes, not a disguised sales pitch. Do not open with "I was looking at local businesses in the area...". No banned generic compliments, no fake urgency, no "AI-powered" language, no bullet-point feature lists.

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
 * Generates one Bookrightly outreach message. Should read like Dean
 * personally noticed something real about the prospect's online presence —
 * introduce Dean/Bookrightly, mention one real, honest observation
 * (no website, or a real finding on an existing one), explain what
 * Bookrightly offers, and close with a low-pressure "would you be
 * interested?" pointing at bookrightly.co.uk.
 *
 * @param {object} input
 * @param {string} input.businessName
 * @param {string} [input.contactName]
 * @param {string} [input.industry]
 * @param {string} input.channel - one of CHANNELS
 * @param {string} input.myName
 * @param {object[]} input.findings - from findingSelector.selectTopFindings(...).findings
 * @param {'initial'|'followup1'|'followup2'|'soft'} [input.mode]
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
    prompt = buildFollowUpPrompt({ businessName: input.businessName, channel, myName: input.myName, stage: mode === 'followup2' ? 2 : 1, findings: input.findings ?? [] });
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
      includeScore: !!input.includeScore,
      overallScore: input.overallScore,
    });
  }

  return runProviderChain(prompt, keys);
}

module.exports = {
  CHANNELS,
  CTA_VARIATIONS,
  NO_WEBSITE_FINDING_ID,
  hasNoRealWebsite,
  PRODUCT_DESCRIPTION,
  generateGrowthAuditOutreach,
  buildInitialPrompt,
  buildFollowUpPrompt,
  buildSoftPrompt,
};
