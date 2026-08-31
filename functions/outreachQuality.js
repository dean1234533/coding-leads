'use strict';

const { PRODUCT_URL } = require('./growthAuditConfig');

// Deterministic (non-AI) quality gate for a generated outreach message —
// checked in code rather than asking another AI call to grade its own
// homework, since "does this contain an unsupported claim" and "did it use
// a banned phrase" are things we can actually verify reliably by pattern
// matching, and a second AI pass can't be trusted to enforce this any more
// than the first one already tried to.
//
// Mirrors the 10-point checklist from the outreach spec:
//  1. mentions genuine audit findings         -> evidence
//  2. avoids unsupported claims                -> noUnsupportedClaims
//  3. short enough for the channel             -> brevity
//  4. sounds human                             -> naturalTone
//  5. explains the benefit of using the audit  -> explainsBenefit
//  6. includes the audit URL                   -> includesAuditUrl
//  7. CTA is focused on trying the tool        -> ctaQuality
//  8. avoids immediately selling web dev       -> ctaQuality (no hard sell)
//  9. avoids asking to send a PDF              -> naturalTone (banned phrase)
// 10. avoids generic AI language               -> naturalTone (banned phrase)

const BANNED_PHRASES = [
  "hope you're well",
  'hope this email finds you well',
  'i came across your amazing business',
  'i came across your business',
  'i help businesses like yours',
  'would you be interested in a website',
  "in today's digital age",
  'i hope this message finds you',
  'i wanted to reach out',
  'i noticed your amazing business',
  'i noticed the potential for enhancement',
  'comprehensive and engaging',
  'leverage',
  'synergy',
  'circle back',
  'touch base',
  'take your business to the next level',
  // The old, automated-sounding opener this system used to use — Dean must
  // be introduced first, not "I was looking at local businesses..." cold.
  'i was looking at local businesses in the area',
  // Generic sales-brochure copy — the prospect already knows what a
  // website does; evidence from their own site should do the work instead.
  'a working, fast, mobile-friendly website can make a big difference',
  // The old "I'll send you the audit" pattern this system used to use —
  // now obsolete: the audit is self-serve via the tool link, never sent.
  'send you the audit',
  'send you the report',
  'send you the pdf',
  'send over the audit',
  'send over the full audit',
  'would you like me to send',
  'i can send you',
  // Generic AI hype — the tool should read as useful, not gimmicky.
  'ai-powered',
  'ai powered',
  'ai website audit',
  'revolutionary ai',
  'cutting-edge ai',
  'game-changing',
  'game changing',
];

// Premature/aggressive asks the spec bans as the FIRST message — getting
// them to try the audit tool is the only objective here; selling web
// development, or any other hard CTA, comes later once they've engaged.
const AGGRESSIVE_CTA_PHRASES = [
  'book a call',
  'buy a website',
  'pay me',
  'sign up today',
  'purchase now',
  'buy now',
  'build you a website',
  'redesign your site',
  'redesign your website',
  'would you like a quote',
  'can i build',
  'can i redesign',
];

// Absolute-certainty language is a red flag regardless of source — even a
// "measured" finding shouldn't be oversold as a guarantee of outcome.
const OVERCLAIM_PHRASES = ['guaranteed', '100% certain', 'definitely will', 'i guarantee'];
const BENEFIT_PATTERN = /\b(visitors?|customers?|enquir(?:y|ies)|book(?:ing|ings)?|appointments?|contact|read(?:able)?|usability|visibility|conversion|trust|frustrat(?:e|ing)|harder to|easier to)\b/i;

// The outreach analyzer (outreachWebsiteAudit.js) is a separate, lightweight,
// non-browser system — it never runs Growth Audit, never uses Browser
// Rendering/Puppeteer/Playwright/Lighthouse/PageSpeed Insights, and produces
// no LCP/FCP/CLS/TBT/score numbers at all. A generated message claiming
// otherwise would be a factual misrepresentation of what actually happened,
// not just a tone issue — checked separately from BANNED_PHRASES/naturalTone
// so it always hard-fails the gate (see FABRICATED_SOURCE_PHRASES below).
const FABRICATED_SOURCE_PHRASES = [
  'ran your site through growth audit',
  'ran your website through growth audit',
  'ran it through growth audit',
  'through the growth audit',
  'growth audit scored your',
  'growth audit gave your',
  'your growth audit score',
  'your pagespeed score',
  'your lighthouse score',
  'core web vitals are',
  'your lcp is',
  'your fcp is',
  'your cls is',
  'your tbt is',
  'using browser rendering',
  'browser rendering shows',
];

const CHANNEL_WORD_LIMITS = {
  email: 130,
  whatsapp: 90,
  instagram: 80,
  facebook: 100,
  linkedin: 100,
  sms: 50,
};

// The exact domain from PRODUCT_URL, e.g. "bookrightly.co.uk" — checked
// as a substring so it still matches with a trailing UTM query string.
const PRODUCT_URL_HOST = new URL(PRODUCT_URL).host;

function wordCount(text) {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function containsAny(haystack, phrases) {
  const lower = haystack.toLowerCase();
  return phrases.filter((p) => lower.includes(p));
}

// A bare "N/100" score dump, or a bullet-list longer than 3 items, both
// read as an automated audit report rather than a personal note — the
// audit tool is where the prospect explores the full findings themselves.
const SCORE_PATTERN = /\b\d{1,3}\s*\/\s*100\b/;

function bulletLineCount(text) {
  return (text.match(/^\s*[•\-*]\s+/gm) ?? []).length;
}

/**
 * @param {string} body
 * @param {object} opts
 * @param {string} opts.businessName
 * @param {string} opts.channel
 * @param {object[]} opts.findingsUsed - the findings actually passed to the generator
 * @param {boolean} [opts.includeScore] - whether the score was explicitly opted into
 * @returns {{ score: number, passed: boolean, issues: string[], checks: object }}
 */
function assessOutreachQuality(body, opts = {}) {
  const { businessName = '', channel = 'email', findingsUsed = [], includeScore = false } = opts;
  const issues = [];
  const text = body || '';

  // 1. Mentions genuine audit findings — references at least one real
  // finding's own words, not just a vague "I noticed some issues". Checks
  // for any distinctive word (5+ chars) from each finding's evidence/
  // description appearing in the body.
  const evidenceWords = findingsUsed
    .flatMap((f) => `${f.outreachText ?? ''} ${f.evidence ?? ''} ${f.description ?? ''}`.toLowerCase().split(/\W+/))
    .filter((w) => w.length >= 5);
  const hasEvidence = findingsUsed.length === 0 || evidenceWords.some((w) => text.toLowerCase().includes(w));
  if (findingsUsed.length > 0 && !hasEvidence) issues.push('Does not clearly reference any specific audit finding.');

  // 2. Unsupported claims — absolute-certainty language.
  const overclaimHits = containsAny(text, OVERCLAIM_PHRASES);
  if (overclaimHits.length > 0) issues.push(`Contains overclaiming language: ${overclaimHits.join(', ')}.`);

  // 2b. Fabricated source claims — the outreach analyzer never runs Growth
  // Audit, Browser Rendering, PageSpeed Insights, or Lighthouse, and never
  // produces LCP/FCP/CLS/TBT/score numbers. A message claiming otherwise is
  // a factual misrepresentation, not just a tone slip — hard-fails on its own.
  const fabricatedSourceHits = containsAny(text, FABRICATED_SOURCE_PHRASES);
  if (fabricatedSourceHits.length > 0) issues.push(`Misrepresents how the findings were produced (claims Growth Audit/Browser Rendering/a fabricated performance score): ${fabricatedSourceHits.join(', ')}.`);

  // 3. Brevity — channel-appropriate length.
  const words = wordCount(text);
  const limit = CHANNEL_WORD_LIMITS[channel] ?? CHANNEL_WORD_LIMITS.email;
  const withinLength = words <= limit;
  if (!withinLength) issues.push(`Too long for ${channel} (${words} words, limit ~${limit}).`);

  // 4/9/10. Natural tone — no generic/AI-sounding boilerplate, no obsolete
  // "send you the audit" language, no AI hype.
  const bannedHits = containsAny(text, BANNED_PHRASES);
  if (bannedHits.length > 0) issues.push(`Contains a banned phrase: ${bannedHits.join(', ')}.`);

  // 5. Explains the benefit of using the audit — there's real substance
  // beyond just a bare link (a message that's only a URL isn't "explaining"
  // anything).
  const explainsBenefit = findingsUsed.length === 0 || (hasEvidence && words >= 15 && BENEFIT_PATTERN.test(text));
  if (findingsUsed.length > 0 && !explainsBenefit) issues.push('Does not explain why the findings matter before linking to the tool.');

  // 6. Includes the Bookrightly link — every message (no-website or
  // has-findings) always points at PRODUCT_URL now.
  const includesAuditUrl = text.includes(PRODUCT_URL_HOST);
  if (!includesAuditUrl) issues.push('Does not include the Bookrightly link.');

  // 7/8. CTA quality — points at trying the tool, not an immediate hard
  // sell (book a call / build a website / quote), and not the old
  // "I'll send you the audit" pattern.
  const aggressiveHits = containsAny(text, AGGRESSIVE_CTA_PHRASES);
  if (aggressiveHits.length > 0) issues.push(`Contains a premature hard-sell CTA: ${aggressiveHits.join(', ')}.`);

  // Personalisation — mentions the actual business, not a placeholder.
  const mentionsBusiness = businessName && text.toLowerCase().includes(businessName.toLowerCase());
  if (businessName && !mentionsBusiness) issues.push('Does not mention the business by name.');

  // Doesn't read like an automated audit report — no bare score dump unless
  // explicitly opted into, and no long bullet-point finding/feature list.
  const hasUnwantedScore = !includeScore && SCORE_PATTERN.test(text);
  if (hasUnwantedScore) issues.push('Includes a numeric audit score without it being explicitly requested.');
  const bulletCount = bulletLineCount(text);
  const hasBulletDump = bulletCount > 3;
  if (hasBulletDump) issues.push(`Reads like an audit report dump (${bulletCount} bullet points) rather than a personal message.`);

  const checks = {
    personalisation: !!mentionsBusiness,
    evidence: hasEvidence,
    explainsBenefit,
    includesAuditUrl,
    brevity: withinLength,
    naturalTone: bannedHits.length === 0,
    ctaQuality: aggressiveHits.length === 0,
    noUnsupportedClaims: overclaimHits.length === 0,
    notAuditDump: !hasUnwantedScore && !hasBulletDump,
    noFabricatedSource: fabricatedSourceHits.length === 0,
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passedChecks / Object.keys(checks).length) * 100);

  // A message only "passes" with zero hard-fail issues — no unsupported
  // claims, no fabricated Growth-Audit/performance-score claims, no banned/
  // obsolete phrases, no premature hard-sell CTA, and it must actually
  // include the audit link (the whole point of this system).
  // Missing personalisation, evidence, benefit, or brevity now blocks the
  // draft too. Those are conversion fundamentals, not optional polish.
  const passed = Object.values(checks).every(Boolean);

  return { score, passed, issues, checks };
}

module.exports = { assessOutreachQuality, BANNED_PHRASES, AGGRESSIVE_CTA_PHRASES, OVERCLAIM_PHRASES, FABRICATED_SOURCE_PHRASES, CHANNEL_WORD_LIMITS };
