'use strict';

// Deterministic (non-AI) quality gate for a generated outreach message —
// checked in code rather than asking another AI call to grade its own
// homework, since "does this contain an unsupported claim" and "did it use
// a banned phrase" are things we can actually verify reliably by pattern
// matching, and a second AI pass can't be trusted to enforce this any more
// than the first one already tried to.

const BANNED_PHRASES = [
  "hope you're well",
  'hope this email finds you well',
  'i came across your amazing business',
  'i came across your business',
  'i help businesses like yours',
  'would you be interested in a website',
  'in today\'s digital age',
  'i hope this message finds you',
  'i noticed the potential for enhancement',
  'comprehensive and engaging',
  'leverage',
  'synergy',
  'circle back',
  'touch base',
  'take your business to the next level',
];

// Aggressive/premature CTAs the spec explicitly bans as the FIRST ask — the
// audit generator's job is to get a reply, not close a sale in message one.
const AGGRESSIVE_CTA_PHRASES = ['book a call', 'buy a website', 'pay me', 'sign up today', 'purchase now', 'buy now'];

// Absolute-certainty language is a red flag regardless of source — even a
// "measured" finding shouldn't be oversold as a guarantee of outcome.
const OVERCLAIM_PHRASES = ['guaranteed', '100% certain', 'definitely will', 'i guarantee'];

const CHANNEL_WORD_LIMITS = {
  email: 180,
  whatsapp: 70,
  instagram: 70,
  facebook: 70,
  linkedin: 130,
  sms: 50,
};

function wordCount(text) {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function containsAny(haystack, phrases) {
  const lower = haystack.toLowerCase();
  return phrases.filter((p) => lower.includes(p));
}

/**
 * @param {string} body
 * @param {object} opts
 * @param {string} opts.businessName
 * @param {string} opts.channel
 * @param {object[]} opts.findingsUsed - the findings actually passed to the generator
 * @returns {{ score: number, passed: boolean, issues: string[], checks: object }}
 */
function assessOutreachQuality(body, opts = {}) {
  const { businessName = '', channel = 'email', findingsUsed = [] } = opts;
  const issues = [];
  const text = body || '';

  // Personalisation — mentions the actual business, not a placeholder.
  const mentionsBusiness = businessName && text.toLowerCase().includes(businessName.toLowerCase());
  if (businessName && !mentionsBusiness) issues.push('Does not mention the business by name.');

  // Evidence — references at least one real finding's own words, not just a
  // vague "I noticed some issues". Checks for any distinctive word (4+
  // chars) from each finding's evidence/description appearing in the body.
  const evidenceWords = findingsUsed
    .flatMap((f) => `${f.evidence ?? ''} ${f.description ?? ''}`.toLowerCase().split(/\W+/))
    .filter((w) => w.length >= 5);
  const hasEvidence = findingsUsed.length === 0 || evidenceWords.some((w) => text.toLowerCase().includes(w));
  if (findingsUsed.length > 0 && !hasEvidence) issues.push('Does not clearly reference any specific audit finding.');

  // Brevity — channel-appropriate length.
  const words = wordCount(text);
  const limit = CHANNEL_WORD_LIMITS[channel] ?? CHANNEL_WORD_LIMITS.email;
  const withinLength = words <= limit;
  if (!withinLength) issues.push(`Too long for ${channel} (${words} words, limit ~${limit}).`);

  // Natural tone — no generic/AI-sounding boilerplate.
  const bannedHits = containsAny(text, BANNED_PHRASES);
  if (bannedHits.length > 0) issues.push(`Contains generic/AI-sounding phrase(s): ${bannedHits.join(', ')}.`);

  // CTA quality — low-pressure, offers to send the audit, not a hard sell.
  const aggressiveHits = containsAny(text, AGGRESSIVE_CTA_PHRASES);
  if (aggressiveHits.length > 0) issues.push(`Contains an aggressive/premature CTA: ${aggressiveHits.join(', ')}.`);
  const offersAudit = /audit|findings|(what i (found|noticed|spotted))/i.test(text);
  if (!offersAudit) issues.push('Does not offer to send the audit/findings as the next step.');

  // Unsupported claims — absolute-certainty language.
  const overclaimHits = containsAny(text, OVERCLAIM_PHRASES);
  if (overclaimHits.length > 0) issues.push(`Contains overclaiming language: ${overclaimHits.join(', ')}.`);

  const checks = {
    personalisation: !!mentionsBusiness,
    evidence: hasEvidence,
    brevity: withinLength,
    naturalTone: bannedHits.length === 0,
    ctaQuality: aggressiveHits.length === 0 && offersAudit,
    noUnsupportedClaims: overclaimHits.length === 0,
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passedChecks / Object.keys(checks).length) * 100);

  // A message only "passes" with zero hard-fail issues — no unsupported
  // claims, no aggressive CTA, no banned phrases. Personalisation/evidence/
  // brevity missing lowers the score but doesn't necessarily block sending
  // (the human reviews it either way), those three are the ones the spec
  // treats as non-negotiable ("do NOT show a message as high quality if it
  // contains unsupported claims").
  const passed = checks.naturalTone && checks.ctaQuality && checks.noUnsupportedClaims;

  return { score, passed, issues, checks };
}

module.exports = { assessOutreachQuality, BANNED_PHRASES, AGGRESSIVE_CTA_PHRASES, OVERCLAIM_PHRASES, CHANNEL_WORD_LIMITS };
