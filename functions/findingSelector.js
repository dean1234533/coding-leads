'use strict';

// Picks the 1-3 strongest, genuinely-real findings from a Growth Audit
// result to build outreach around. `audit.recommendations` (from the Growth
// Audit product) is already the right source of truth to build on:
//   - It's pre-filtered to exclude not_applicable/not_verified checks and
//     info-severity/passing checks entirely (see runFullAudit.ts's
//     failedChecks filter in the Growth Audit codebase) — so anything that
//     shows up here already survived the audit's own confidence gate.
//   - It's pre-sorted by priority (severity + impact weighted).
//   - Each item already carries plain-ish title/description, real evidence
//     (the detected detail text), and detectionMethod (== measurementType:
//     'measured' | 'detected' | 'inferred' | 'not_available') for hedging.
// This module's job is just: don't pick 3 findings that are really the same
// underlying problem, and prefer findings relevant to the business type
// when the audit genuinely supports it — never invent relevance that isn't
// there.

const MIN_MEANINGFUL_SEVERITY = new Set(['critical', 'high', 'medium']);

// Business-type -> category focus, per spec. Used only to break ties among
// otherwise-similar-priority findings — never to override what the audit
// actually found being the strongest issue.
const BUSINESS_TYPE_CATEGORY_FOCUS = {
  personal_trainer: ['conversion', 'localSeo', 'trust'],
  barber: ['conversion', 'mobile', 'localSeo'],
  salon: ['conversion', 'mobile', 'localSeo'],
  painter_decorator: ['localSeo', 'conversion', 'trust'],
  decorator: ['localSeo', 'conversion', 'trust'],
  painter: ['localSeo', 'conversion', 'trust'],
  restaurant: ['mobile', 'localSeo', 'conversion'],
  clinic: ['trust', 'conversion', 'accessibility', 'localSeo'],
  dentist: ['trust', 'conversion', 'accessibility', 'localSeo'],
  chiropractor: ['trust', 'conversion', 'accessibility', 'localSeo'],
  trades: ['conversion', 'localSeo', 'mobile'],
  plumber: ['conversion', 'localSeo', 'mobile'],
  electrician: ['conversion', 'localSeo', 'mobile'],
};

function normaliseBusinessType(businessType) {
  if (!businessType) return null;
  const key = String(businessType).toLowerCase().replace(/[\s-]+/g, '_');
  return BUSINESS_TYPE_CATEGORY_FOCUS[key] ? key : null;
}

/**
 * @param {object} audit - a Growth Audit AuditResult (audit.recommendations required)
 * @param {object} [opts]
 * @param {string} [opts.businessType]
 * @param {number} [opts.maxFindings]
 * @returns {{ findings: object[], hasEnough: boolean }}
 */
function selectTopFindings(audit, opts = {}) {
  const maxFindings = opts.maxFindings ?? 3;
  const recommendations = Array.isArray(audit?.recommendations) ? audit.recommendations : [];

  // Already sorted by priority by the audit itself; just defend against a
  // caller passing an unsorted array (e.g. in tests).
  const sorted = [...recommendations].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const businessTypeKey = normaliseBusinessType(opts.businessType);
  const focusCategories = businessTypeKey ? BUSINESS_TYPE_CATEGORY_FOCUS[businessTypeKey] : null;

  // One finding per category by default — the real, user-facing fix for
  // "don't repeat the same underlying problem" (e.g. several mobile-CSS
  // findings all collapse to picking the single strongest one under
  // category "mobile", rather than mentioning three separate symptoms of
  // the same responsive-design issue).
  const seenCategories = new Set();
  const candidates = [];
  for (const rec of sorted) {
    if (seenCategories.has(rec.category)) continue;
    seenCategories.add(rec.category);
    candidates.push(rec);
  }

  // Business-type relevance is a tie-breaker only: re-rank within small
  // priority bands (+/-5) so a focus-category match jumps ahead of a
  // near-equal generic one, but a genuinely bigger issue never gets buried
  // under a smaller one just because it's not in the "expected" list for
  // this business type.
  let ranked = candidates;
  if (focusCategories) {
    ranked = [...candidates].sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (Math.abs(priorityDiff) > 5) return priorityDiff;
      const aFocus = focusCategories.includes(a.category) ? 1 : 0;
      const bFocus = focusCategories.includes(b.category) ? 1 : 0;
      return bFocus - aFocus || priorityDiff;
    });
  }

  const findings = ranked.slice(0, maxFindings).map((rec) => ({
    id: rec.id,
    category: rec.category,
    title: rec.title,
    description: rec.description,
    evidence: rec.evidence,
    severity: rec.severity,
    impact: rec.impact,
    // measurementType, kept under both names — detectionMethod matches the
    // Growth Audit's own Recommendation field name, measurementType is the
    // more familiar name used elsewhere in outreach code.
    detectionMethod: rec.detectionMethod,
    measurementType: rec.detectionMethod,
  }));

  const hasEnough = findings.some((f) => MIN_MEANINGFUL_SEVERITY.has(f.severity));

  return { findings, hasEnough };
}

module.exports = { selectTopFindings, BUSINESS_TYPE_CATEGORY_FOCUS, normaliseBusinessType };
