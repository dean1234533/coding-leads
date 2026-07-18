'use strict';

const axios = require('axios');
const { assessDesign } = require('./websiteDesignAudit');

// Maps Lighthouse audit failures to the same WEBSITE_ISSUES checklist used
// by the manual Website Review tab, so an auto-audited lead's issues drive
// {{issue_highlight}} in outreach emails exactly like a manually-reviewed
// one would — no separate code path needed on the frontend.
function deriveIssues(categories, audits, finalUrl) {
  const issues = [];
  const performanceScore = Math.round((categories.performance?.score ?? 1) * 100);

  if (performanceScore < 50) issues.push('Slow Loading');
  if (audits['meta-viewport']?.score === 0) issues.push('Not Mobile Friendly');
  // Not audits['is-on-https'] — that flags the *initial* request even when
  // it's a clean http -> https redirect (e.g. Places listing a bare http://
  // URL for a site that's fully HTTPS once it loads). What the visitor
  // actually lands on is the only thing that matters here.
  if (!finalUrl?.startsWith('https://')) issues.push('Missing SSL');
  if (audits['target-size']?.score === 0) issues.push('Cluttered Mobile Nav');
  if (audits['image-alt']?.score === 0) issues.push('Low Quality Images');
  // Not audits['color-contrast'] — that's a strict binary WCAG check that
  // fails on a single low-contrast element (a footer link, a hover state)
  // even when the actual body text is perfectly readable. Left to the AI
  // visual judgment instead, which is a much closer proxy for "would a
  // human find this hard to read" (see VISUAL_ISSUES in websiteDesignAudit.js).
  if (audits['document-title']?.score === 0 || audits['meta-description']?.score === 0) issues.push('Poor CTA');
  if (audits['link-text']?.score === 0) issues.push('Confusing Layout');

  return issues;
}

/**
 * Runs a real PageSpeed Insights (Lighthouse) audit against a live URL and
 * maps the results onto the same fields the manual Website Review tab uses
 * (websiteScore, issuesChecklist, speedNotes, mobileNotes, seoNotes) — so an
 * auto-audited lead looks identical to a manually-reviewed one everywhere
 * else in the app (outreach personalization, filters, etc.).
 *
 * @returns {Promise<object|null>} audit fields, or null if the audit failed
 *   (dead site, blocked, timed out) — never throws, since one bad site
 *   shouldn't break a batch of leads being added.
 */
async function auditWebsite(url, apiKey, visionKeys) {
  if (!url || !apiKey) return null;

  try {
    // Built manually (not via axios's `params` object) because axios
    // serializes array values as `category[]=x`, which PageSpeed silently
    // ignores beyond the first entry — only 'performance' audits would ever
    // come back, dropping every seo/accessibility/best-practices check.
    const reqUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    reqUrl.searchParams.set('url', url);
    reqUrl.searchParams.set('strategy', 'mobile');
    reqUrl.searchParams.set('key', apiKey);
    for (const cat of ['performance', 'seo', 'accessibility', 'best-practices']) {
      reqUrl.searchParams.append('category', cat);
    }

    // PageSpeed genuinely takes 30s+ on slow, heavy sites — exactly the
    // kind of site this app is most likely to be auditing — so a tight
    // timeout here was failing real audits, not just broken ones.
    const { data } = await axios.get(reqUrl.toString(), { timeout: 55_000 });

    const categories = data.lighthouseResult?.categories ?? {};
    const audits = data.lighthouseResult?.audits ?? {};

    // The request itself succeeded, but the page it loaded is an error page
    // (404, 500, etc.) — there's no real content to judge, so don't run any
    // design/content checks against it (they'd just be judging the error
    // page's own generic layout, not the business's actual site).
    if (audits['http-status-code']?.score === 0) {
      return {
        auditFailed: true,
        error: `page returned HTTP ${audits['http-status-code'].displayValue ?? 'error status'}`,
        // A broken site link is one of the strongest, most concrete things
        // to open an outreach email with — surfaced through the same
        // aiDesignNote/issuesChecklist fields a normal audit uses, so it
        // actually reaches {{issue_highlight}} instead of only ever showing
        // up in the CRM notes Dean sees but the lead never does.
        issuesChecklist: ['Broken Links'],
        aiDesignNote: 'your website link came back as a broken page (a 404 error) when I tried to visit it',
      };
    }

    const performanceScore = Math.round((categories.performance?.score ?? 0) * 100);
    const seoScore = Math.round((categories.seo?.score ?? 0) * 100);
    const accessibilityScore = Math.round((categories.accessibility?.score ?? 0) * 100);

    const technicalIssues = deriveIssues(categories, audits, data.lighthouseResult?.finalUrl);

    // PageSpeed only measures technical stuff (speed, alt text, contrast) —
    // it can't judge whether a site actually looks dated or unbranded. Reuse
    // the screenshot PageSpeed already captured and have Gemini look at it
    // for the things a human would actually notice.
    const screenshot = audits['final-screenshot']?.details?.data;
    const design = await assessDesign(screenshot, visionKeys);
    const issuesChecklist = [...new Set([...technicalIssues, ...(design?.issues ?? [])])];

    const impressionParts = [`Auto-audited — PageSpeed performance ${performanceScore}/100.`];
    if (design?.impression) impressionParts.push(design.impression);

    return {
      websiteScore: performanceScore,
      issuesChecklist,
      speedNotes: `Auto-audit: PageSpeed performance ${performanceScore}/100 (mobile).${audits['speed-index']?.displayValue ? ` Speed index: ${audits['speed-index'].displayValue}.` : ''}`,
      mobileNotes: audits['meta-viewport']?.score === 0 ? 'Auto-audit: missing responsive viewport meta tag.' : `Auto-audit: viewport OK.`,
      seoNotes: `Auto-audit: SEO score ${seoScore}/100, accessibility ${accessibilityScore}/100.`,
      overallImpression: impressionParts.join(' '),
      // Stored separately (not just folded into overallImpression) so
      // outreach templates can quote this specific, real observation instead
      // of falling back to the generic per-checkbox wording in ISSUE_DETAILS.
      aiDesignNote: design?.impression || null,
    };
  } catch (err) {
    const reason = err.response?.data?.error?.message ?? err.message;
    console.warn(`[websiteAudit] Audit failed for ${url}: ${reason}`);
    // Surfaced to the lead's notes instead of silently leaving fields blank —
    // "nothing found" and "audit couldn't even run" look identical otherwise.
    return { auditFailed: true, error: reason };
  }
}

module.exports = { auditWebsite };
