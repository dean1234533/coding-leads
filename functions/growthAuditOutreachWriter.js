'use strict';

const axios = require('axios');
const { buildAuditToolUrl, PORTFOLIO_URL } = require('./growthAuditConfig');

const CHANNELS = ['email', 'whatsapp', 'instagram', 'facebook', 'linkedin'];

// Set by outreachWebsiteAudit.js when the lead's "website" is actually just
// an Instagram/Facebook page — there is no real site to run through an
// audit tool, so pitching Growth Audit for that lead is factually wrong
// ("here's a free tool to check your website" when there isn't one). Any
// prompt builder below must check for this and pivot to offering to build
// them a real site instead, never mentioning the audit tool at all.
const NO_WEBSITE_FINDING_ID = 'identity.socialOnly';
function hasNoRealWebsite(findings) {
  return (findings ?? []).some((f) => f.id === NO_WEBSITE_FINDING_ID);
}

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

const CHANNEL_GUIDANCE = {
  email: `This is an EMAIL. Aim for 80-130 words. No "Dear [Business]," corporate opener. A real subject line is still needed (return it separately).\n\n${SUBJECT_LINE_GUIDANCE}`,
  whatsapp: 'This is a WHATSAPP message. Aim for 50-90 words, conversational, like a real text. No formal sign-off — just "Dean".',
  instagram: 'This is an INSTAGRAM DM. Aim for 40-80 words, casual and short. No formal sign-off — just "Dean".',
  facebook: 'This is a FACEBOOK MESSENGER DM. Aim for 50-100 words, casual and direct. No formal sign-off — just "Dean".',
  linkedin: 'This is a LINKEDIN message. Aim for 50-100 words, professional but conversational — not a corporate pitch.',
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
  // outreachText (set by outreachWebsiteAudit.js's lightweight analyzer) is a
  // pre-written, already-natural-language phrasing of the finding — prefer it
  // over the more technical evidence/description strings when present.
  const detail = finding.outreachText || finding.evidence || finding.description;
  return `- [${finding.category}] ${finding.title}\n  What was actually found: ${detail}\n  Confidence: ${finding.measurementType} — ${hedge}`;
}

function firstName(myName) {
  return String(myName ?? 'Dean').trim().split(/\s+/)[0] || 'Dean';
}

// Shared identity block every prompt gets. Deliberately factual and
// un-hyped — the model already has the finding data, it doesn't need to be
// told to be impressed by its own tech, and it should never claim to be
// anything other than the actual person who built the tool.
//
// IMPORTANT HONESTY NOTE: the findings passed into this prompt come from a
// separate, lightweight, non-browser website check (outreachWebsiteAudit.js)
// — NOT from running the prospect's site through the live Growth Audit
// product. The two are deliberately separate systems (see that file's
// module comment for why: outreach volume must never consume Growth
// Audit's shared Browser Rendering budget). The model must never say or
// imply "I ran your site through Growth Audit" or "I ran your site through
// my audit tool" — the findings came from Dean looking/checking directly.
// Growth Audit is offered afterwards as a separate, free tool the prospect
// can run themselves for the fuller, real-browser picture.
// Just the identity fact, no Growth Audit framing — used on its own by the
// no-real-website prompt below, since that framing ends with "you are now
// offering Growth Audit afterwards", which would directly contradict an
// instruction to never mention it.
function baseIdentityFact(myName) {
  const first = firstName(myName);
  return `You are ${myName ?? 'Dean Burt'} (goes by "${first}"), a freelance web developer and designer (dean-da-dev.co.uk, dean@dean-da-dev.co.uk).`;
}

function identityBlock(myName) {
  return `${baseIdentityFact(myName)} You also built Growth Audit, a free website auditing and monitoring tool (checks performance, conversion, mobile usability, SEO, local SEO, accessibility and trust signals, with real browser rendering). You are NOT writing this message as a report generated by Growth Audit — you personally had a quick look at/ran a lightweight check on the prospect's website yourself, and are now offering Growth Audit afterwards as a separate free tool they can run themselves for the fuller picture.`;
}

function auditIntroSentence() {
  return 'Mention that you also built a free website audit tool (Growth Audit) that checks things like SEO, mobile experience, accessibility, trust signals and conversion — offered as a separate, useful thing for them to try themselves, not as the source of the findings you just mentioned. Never say "I ran your site through it" or "I ran your site through Growth Audit" — factual, not hyped, and never "AI-powered", "AI website audit" or "revolutionary".';
}

// A completely different message for a lead with no real website at all —
// the entire rest of this module is built around "here's a free tool to
// check your website", which is nonsensical (and reads as broken/careless)
// when what they actually have is an Instagram or Facebook page. This never
// mentions Growth Audit, an audit tool, or any link — there's nothing to
// audit — and instead makes the same kind of concrete, low-pressure offer
// (a free homepage concept, no obligation) the general cold-outreach
// prompt uses for this exact scenario.
function buildNoRealWebsitePrompt({ businessName, contactName, industry, channel, myName, findings }) {
  const first = firstName(myName);
  const socialFinding = (findings ?? []).find((f) => f.id === NO_WEBSITE_FINDING_ID);
  const platformDetail = socialFinding?.outreachText
    || 'the link listed for this business actually goes to a social media page (Instagram or Facebook), not a real website';

  return `${baseIdentityFact(myName)}

You are writing a first outreach message to a local business, ${businessName || 'the business'}${contactName ? ` (contact: ${contactName})` : ''}. This business does NOT have a real website — the only link on record for them is a social media page, not something that can be run through an audit tool. This message must NEVER mention Growth Audit, "your website audit", an audit tool, or any link to check — there is nothing to audit. Instead, offer to put together a free homepage concept so they can see what a real website could look like for them.

BUSINESS: ${businessName || 'the business'}${industry ? `\nINDUSTRY: ${industry}` : ''}

WHAT WAS FOUND (use this, don't invent anything beyond it): ${platformDetail}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

STRUCTURE (in your own words, vary phrasing and sentence order each time):
1. GREETING — "Hi ${businessName ? `${businessName} team` : 'there'},"
2. INTRODUCTION — introduce yourself as ${first}, a web developer and designer, and say you came across their page.
3. OBSERVATION — mention factually, without judgement, that their online presence right now is their Instagram/Facebook page rather than a website of their own — reference the specific detail found above in your own words.
4. WHY IT MATTERS — briefly, in plain English, why a real website is worth having alongside that — e.g. it's easier for customers to find and contact them, it shows up in a Google search the way a social page doesn't, and it's actually theirs rather than a page a platform controls. Hedged and factual, never "you're losing customers" or anything stated as certain.
5. CONCRETE OFFER — offer to put together a free homepage concept for ${businessName || 'them'}, no obligation, so they can see what a real website could look like for their business.
6. LOW-PRESSURE CLOSE — invite them to let you know if they're interested and you'll send it over. No hard CTA, no deadline, no link of any kind.
7. SIGN-OFF — ${channel === 'email' ? `professional signature:\nKind regards,\n\nDean Burt\nWeb Developer & Designer\ndean-da-dev.co.uk\ndean@dean-da-dev.co.uk` : `just "${first}" on its own line, nothing more formal.`}

BANNED — never do any of these:
- Never mention Growth Audit, "audit tool", "run your website through", "check your website", or any link — there is no website to point them to.
- Never say or imply you checked/audited/ran their website — you noticed they don't have a real one.
- Do not open with "I was looking at local businesses in the area...", "I hope this message finds you well", or a generic compliment.
- No fake urgency, no exclamation marks, no "you're losing customers".
- No corporate transition words (Furthermore/Additionally/Moreover).

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."} (no subject needed for this channel, leave it as an empty string)'}`;
}

function buildInitialPrompt({ businessName, contactName, industry, channel, myName, findings, includePortfolio = false, includeScore = false, overallScore, website, leadId, leadCollection }) {
  if (hasNoRealWebsite(findings)) {
    return buildNoRealWebsitePrompt({ businessName, contactName, industry, channel, myName, findings });
  }
  const capped = (findings ?? []).slice(0, 3);
  const findingsBlock = capped.map(describeFindingForPrompt).join('\n');
  const actionHint = BUSINESS_TYPE_ACTION_HINT[String(industry ?? '').toLowerCase().replace(/[\s-]+/g, '_')];
  const link = buildAuditToolUrl(channel, { website, leadId, leadCollection });
  const ctaExamples = CTA_VARIATIONS.map((c) => c.replace('{link}', link)).join('\n');
  const serviceExamples = SERVICE_MENTION_EXAMPLES.join('\n');
  const first = firstName(myName);

  return `${identityBlock(myName)}

You are writing a first outreach message to a local business, ${businessName || 'the business'}${contactName ? ` (contact: ${contactName})` : ''}. This should read like a real person who actually looked at their website, not an automated report and not an advert for your SaaS.

BUSINESS: ${businessName || 'the business'}${industry ? `\nINDUSTRY: ${industry}` : ''}

REAL FINDINGS AVAILABLE (use ONLY these — never invent or assume anything beyond what's listed):
${findingsBlock}

USE THE SINGLE STRONGEST FINDING NORMALLY. Mention a second only when it is clearly different, highly relevant, and still keeps the message inside the channel limit. Never use a third. This is a personal note, not an audit report. Prefer measurable evidence over subjective observations.

AUDIT TOOL LINK (use this EXACT link, do not modify it or invent a different one): ${link}
${includeScore && typeof overallScore === 'number' ? `\nThe site's overall audit score is ${overallScore}/100 — you may mention it if it genuinely helps, but don't lead with it.` : '\nDo NOT mention any numeric audit score in this message — it makes cold outreach feel automated. It is fine (and expected) to mention specific measured findings like load time.'}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

STRUCTURE to hit (in your own words each time — vary phrasing and sentence order, don't reuse the same patterns message to message):
1. GREETING — "Hi ${businessName ? `${businessName} team` : 'there'},"
2. INTRODUCTION — introduce yourself as ${first}, a web developer and designer, and say you came across their website. Example: "I'm ${first}, a web developer and designer, and I came across your website while looking at local businesses." Do NOT start with "I was looking at local businesses in the area..." on its own — ${first} needs to be introduced first, in the same or very next sentence.
3. FINDING — state one specific observation in plain English with its practical effect. Mention a second only if it adds distinct value. Never lead with jargon such as LCP, DOM, schema, viewport, or WCAG.
5. IMPACT — briefly explain what this could mean in plain English, proportional to the evidence. Use hedged language: "could make it harder for...", "can affect...", "may be costing you enquiries...". NEVER say "you're losing customers", "you're losing thousands of pounds", "people are definitely leaving", or state anything as certain that isn't.${actionHint ? ` Where it fits naturally, you can frame the impact in terms of the visitor journey — e.g. "...could make it harder for someone to ${actionHint}." — but only if it reads naturally, don't force it.` : ''}
6. TOOL INTRODUCTION — ${auditIntroSentence()}
7. PRIMARY CTA — send them to the audit tool using the exact link above. Use a CTA in this style (vary which one, don't always pick the first):
${ctaExamples}
8. SERVICE MENTION — optional and one short sentence only, after the CTA. Use wording close to one of these (vary it):
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

function buildFollowUpPrompt({ businessName, channel, myName, stage, website, leadId, leadCollection, findings }) {
  const first = firstName(myName);

  if (hasNoRealWebsite(findings)) {
    const stageGuidance = stage === 2
      ? `This is the FINAL, lowest-pressure follow-up. Example shape (vary wording): "Just leaving this here in case it's still useful — happy to put together that free homepage concept for ${businessName || 'you'} whenever you like, no pressure either way.\n\nAll the best,\n${first}". Do not push again after this.`
      : `This is the FIRST follow-up, sent a few days after the original message with no reply. Example shape (vary wording): "Hi, just following up on my earlier message — still happy to put together a free homepage concept for ${businessName || 'you'} if that's of interest, no obligation at all." Never mention an audit tool or any link — there is no website to check, the offer is the free concept mock-up.`;
    return `You are ${first}, writing a short follow-up to ${businessName || 'a business'} who hasn't replied to your earlier message offering to put together a free homepage concept for them (they don't currently have a real website — their online presence is a social media page).

${stageGuidance}

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

Keep it very short (1-3 sentences). No pressure, no guilt-tripping, no fake urgency. Never mention Growth Audit, an audit tool, or any link. Vary the wording naturally each time rather than using a fixed template.

${channel === 'email' ? 'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}' : 'Respond with ONLY a JSON object: {"subject": "", "body": "..."}'}`;
  }

  const link = buildAuditToolUrl(channel, { website, leadId, leadCollection });
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

function buildSoftPrompt({ businessName, channel, myName, findings, website, leadId, leadCollection }) {
  // Called when the audit came back mostly healthy — genuine minor
  // opportunities only, never manufactured weaknesses. If findings is
  // empty, the prompt below deliberately doesn't ask for any "problem"
  // framing at all.
  const capped = (findings ?? []).slice(0, 2);
  const findingsBlock = capped.length > 0 ? capped.map(describeFindingForPrompt).join('\n') : '(none of real significance — the site is in good shape)';
  const link = buildAuditToolUrl(channel, { website, leadId, leadCollection });
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
 * report: introduce Dean, mention one strong real finding (two only when
 * clearly useful) translated into plain
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
    prompt = buildFollowUpPrompt({ businessName: input.businessName, channel, myName: input.myName, stage: mode === 'followup2' ? 2 : 1, website: input.website, leadId: input.leadId, leadCollection: input.leadCollection, findings: input.findings ?? [] });
  } else if (mode === 'soft') {
    prompt = buildSoftPrompt({ businessName: input.businessName, channel, myName: input.myName, findings: input.findings ?? [], website: input.website, leadId: input.leadId, leadCollection: input.leadCollection });
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
      website: input.website,
      leadId: input.leadId,
      leadCollection: input.leadCollection,
    });
  }

  return runProviderChain(prompt, keys);
}

module.exports = {
  CHANNELS,
  CTA_VARIATIONS,
  SERVICE_MENTION_EXAMPLES,
  NO_WEBSITE_FINDING_ID,
  hasNoRealWebsite,
  generateGrowthAuditOutreach,
  buildInitialPrompt,
  buildFollowUpPrompt,
  buildSoftPrompt,
};
