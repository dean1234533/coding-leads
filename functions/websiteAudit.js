'use strict';

const axios = require('axios');
const { assessDesign } = require('./websiteDesignAudit');

// Known review/testimonial signatures — the third-party plugins (Trustindex,
// Elfsight, etc.) render reviews entirely via JavaScript that loads *after*
// PageSpeed's automated screenshot is captured, and even natively-rendered
// ones (e.g. Elementor's own "Testimonial Carousel" widget) are often built
// as a JS carousel that shows one slide at a time in a way the screenshot
// can catch mid-transition — confirmed on two real leads: a Trustindex
// widget with 23 real Google reviews, and a native Elementor testimonial
// carousel with real named quotes, both read as "No Testimonials" from the
// screenshot alone. A quick check of the raw HTML — not just the screenshot
// — catches these before they become false positives, since the widget's
// own markup is present in the initial HTML even when its content isn't
// fully rendered/visible yet. "testimonial" is deliberately broad (matches
// on the word alone, not just specific plugin names) since it's virtually
// always a reliable signal and covers page-builder-native widgets that
// don't fit a fixed plugin-name list.
const REVIEW_WIDGET_PATTERNS = [/testimonial/i, /trustindex/i, /elfsight/i, /trustpilot/i, /reviews\.io/i, /judge\.me/i, /yotpo/i, /feefo/i, /aggregateRating/i, /based on\s*<?\/?\w*>?\s*\d+\s*<?\/?\w*>?\s*reviews?/i];

async function fetchPageHtml(url, timeout = 15_000) {
  const { data } = await axios.get(url, {
    timeout,
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  });
  return typeof data === 'string' ? data : '';
}

async function pageHtmlHasReviewWidget(url) {
  if (!url) return false;
  try {
    const html = await fetchPageHtml(url);
    return REVIEW_WIDGET_PATTERNS.some((re) => re.test(html));
  } catch {
    // Can't fetch -> no evidence either way, so don't suppress the AI's
    // screenshot-based finding just because this secondary check failed.
    return false;
  }
}

// Named contact-form signatures across page builders/plugins — specific
// enough to trust anywhere they appear, unlike a bare <form> tag which
// could just as easily be a newsletter signup or a search box.
const NAMED_CONTACT_FORM_PATTERNS = [/sqs-block-form/i, /wpcf7|contact-form-7/i, /gravityforms|gform_wrapper/i, /hubspot-form|hs-form-frame|hs_form/i, /elementor-form/i, /ninja-forms|nf-form-cont/i, /formspree\.io/i, /data-netlify/i, /typeform\.com\/to\//i, /jotform/i, /wufoo/i];
// A generic <form> tag is only trustworthy as "this is THE contact form"
// when the page it's on is actually reached via a contact-labeled link —
// on the homepage itself it's too easy to false-match a newsletter signup.
const GENERIC_FORM_RE = /<form\b/i;
// Matches a nav/footer link to a dedicated contact page (href, not link
// text, since text can be anything — "Get In Touch", "Reach Us", etc.).
const CONTACT_LINK_RE = /href=["']([^"']*\/(?:contact(?:-us)?|get-in-touch)\/?[^"']*)["']/i;

// The AI only ever sees one static screenshot of the ONE page it was given
// — a real contact form living on a separate linked page (very common: a
// "Contact" nav link going to /contact while the homepage itself has none)
// is invisible to it, same root problem as the review-widget case above but
// a different cause. Confirmed live: a Squarespace site's homepage
// genuinely has no form, but its /contact page has a real, working
// Squarespace form block the audit never looked at. Checks the audited page
// itself first (covers a same-page JS-render timing issue, same as
// testimonials — a named builder OR a bare <form> both count there, since
// it's the actual audited page), then follows an actual "Contact" link if
// the page has one (a bare <form> counts there too — the URL itself
// confirms intent, unlike an arbitrary form found on the homepage).
async function pageOrContactPageHasForm(url) {
  if (!url) return false;
  try {
    const html = await fetchPageHtml(url);
    if (NAMED_CONTACT_FORM_PATTERNS.some((re) => re.test(html)) || GENERIC_FORM_RE.test(html)) return true;
    const match = html.match(CONTACT_LINK_RE);
    if (!match) return false;
    const contactUrl = new URL(match[1], url).href;
    const contactHtml = await fetchPageHtml(contactUrl, 10_000);
    return NAMED_CONTACT_FORM_PATTERNS.some((re) => re.test(contactHtml)) || GENERIC_FORM_RE.test(contactHtml);
  } catch {
    return false;
  }
}

// Maps Lighthouse audit failures to the same WEBSITE_ISSUES checklist used
// by the manual Website Review tab, so an auto-audited lead's issues drive
// {{issue_highlight}} in outreach emails exactly like a manually-reviewed
// one would — no separate code path needed on the frontend.
function deriveIssues(categories, audits, finalUrl) {
  const issues = [];
  const performanceScore = Math.round((categories.performance?.score ?? 1) * 100);

  if (performanceScore < 50) issues.push('Slow Loading');
  // Not audits['meta-viewport'] — Lighthouse repurposed that audit into an
  // accessibility check for whether pinch-zoom is disabled
  // (user-scalable=no), which is unrelated to whether the page is actually
  // mobile-friendly. A site can deliberately disable zoom on a polished,
  // fully-responsive booking widget and still fail that check, which is
  // exactly what caused a real false positive here. 'viewport-insight' is
  // the current replacement for the old "has a proper viewport meta tag"
  // signal; it's numeric (not binary) so any score under 1 counts as a fail.
  if (typeof audits['viewport-insight']?.score === 'number' && audits['viewport-insight'].score < 1) {
    issues.push('Not Mobile Friendly');
  }
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
  // Lighthouse's raw CLS value (not the curved 0-1 score). Google's own
  // breakpoints are <=0.1 "good", 0.1-0.25 "needs improvement", >0.25
  // "poor" — this used to only catch the "poor" tier, which missed real,
  // visibly-noticeable jumping sitting just above "good" (confirmed on a
  // real lead: 0.108, clearly perceptible on scroll, silently let through).
  // Catches pages that visibly jump around as they load (a carousel
  // shifting the layout under a late image, ads/embeds pushing content
  // down, etc.), which the AI screenshot judgment below can't see since it
  // only ever looks at one static frame. Kept as its own issue rather than
  // folded into "Confusing Layout" so the audit (and the email it drives)
  // names the actual problem instead of a vague catch-all.
  if (audits['cumulative-layout-shift']?.numericValue > 0.1) {
    issues.push('Page Jumps While Loading');
  }

  return issues;
}

// Some free-tier vision providers reject very large uploads — a full-page
// screenshot of a long homepage can run several MB of base64, so cap it and
// fall back to the (smaller, viewport-only) screenshot rather than
// guaranteeing every provider fails on that lead.
const MAX_SCREENSHOT_BASE64_CHARS = 6_000_000;

// `final-screenshot` is only the mobile viewport at the end of the trace —
// it never shows anything below the fold, so the AI vision judgment could
// never actually see (and therefore never flag) things like a missing
// testimonials section, contact form, or Google reviews widget unless they
// happened to sit right at the top of the page. Lighthouse also captures a
// full-page screenshot for the HTML report's element-highlighting feature —
// prefer that so the AI sees the whole page a human would see when
// scrolling. Its exact JSON location has moved across Lighthouse versions,
// so try the known shapes and fall back to the viewport screenshot.
function pickScreenshot(lighthouseResult) {
  const audits = lighthouseResult?.audits ?? {};
  const fullPage =
    lighthouseResult?.fullPageScreenshot?.screenshot?.data ??
    audits['full-page-screenshot']?.details?.screenshot?.data ??
    audits['full-page-screenshot']?.details?.data ??
    null;
  const viewport = audits['final-screenshot']?.details?.data ?? null;
  if (fullPage && fullPage.length <= MAX_SCREENSHOT_BASE64_CHARS) return fullPage;
  return viewport ?? fullPage;
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

    // PageSpeed can take well over a minute on slow, heavy sites — exactly
    // the kind of site this app is most likely to be auditing. 55s, then
    // 100s, both proved not enough in practice for the heaviest sites, so
    // this is deliberately very generous; the caller's own timeout (see
    // auditWebsitesNow callers) and the function's own timeoutSeconds are
    // both set higher still to give this — plus the AI vision fallback
    // chain that runs after it — room to actually finish.
    const { data } = await axios.get(reqUrl.toString(), { timeout: 170_000 });

    // PageSpeed's own request can succeed (HTTP 200 from Google) while still
    // reporting that it couldn't actually load the target site at all —
    // DNS failure, connection refused, the page hanging, etc. Without this
    // check that silently fell through: categories/audits below all default
    // to {}, so every derived score reads as 0/missing and the audit came
    // back looking like a real (very bad) result instead of "never loaded".
    if (!data.lighthouseResult || data.lighthouseResult.runtimeError) {
      const code = data.lighthouseResult?.runtimeError?.code;
      const message = data.lighthouseResult?.runtimeError?.message;
      return {
        auditFailed: true,
        error: message || code || 'the site could not be loaded at all',
        issuesChecklist: ["Site Doesn't Load"],
        aiDesignNote: "your website didn't load at all when I tried to visit it — it may be down, misconfigured, or blocking automated visits",
      };
    }

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
    const screenshot = pickScreenshot(data.lighthouseResult);
    const design = await assessDesign(screenshot, visionKeys);
    let designIssues = design?.issues ?? [];
    let designImpression = design?.impression || null;

    // PageSpeed's mobile run never renders a desktop layout at all, so
    // desktop-only problems (a nav that only breaks down at wider
    // viewports, content that only looks unbalanced on a wide screen) are
    // structurally invisible to everything above — confirmed on a real
    // lead whose messy desktop nav went completely undetected. Best-effort
    // second pass: request/screenshot/vision-check failures here are
    // swallowed so a slow or flaky desktop run never fails the whole audit,
    // it just means desktop-specific issues won't be added this time.
    try {
      const desktopReqUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
      desktopReqUrl.searchParams.set('url', url);
      desktopReqUrl.searchParams.set('strategy', 'desktop');
      desktopReqUrl.searchParams.set('key', apiKey);
      for (const cat of ['performance', 'seo', 'accessibility', 'best-practices']) {
        desktopReqUrl.searchParams.append('category', cat);
      }
      const { data: desktopData } = await axios.get(desktopReqUrl.toString(), { timeout: 170_000 });
      const desktopScreenshot = pickScreenshot(desktopData.lighthouseResult);
      if (desktopScreenshot) {
        const desktopDesign = await assessDesign(desktopScreenshot, visionKeys);
        const newFromDesktop = (desktopDesign?.issues ?? []).filter((i) => !designIssues.includes(i));
        if (newFromDesktop.length > 0) {
          designIssues = [...designIssues, ...newFromDesktop];
          const desktopNote = newFromDesktop.map((i) => i.toLowerCase()).join(', ');
          designImpression = designImpression
            ? `${designImpression} On desktop specifically: ${desktopNote}.`
            : `On desktop: ${desktopNote}.`;
        }
      }
    } catch (err) {
      console.warn(`[websiteAudit] Desktop pass failed for ${url}: ${err.response?.data?.error?.message ?? err.message}`);
    }

    // The AI only ever sees one static screenshot, so a reviews widget that
    // hasn't finished loading yet (see REVIEW_WIDGET_PATTERNS above) reads
    // as "no reviews" even when the page genuinely has them — cross-check
    // against the real page HTML before trusting that specific finding.
    // Only fetched when actually needed, since it's an extra request.
    if (designIssues.includes('No Testimonials') || designIssues.includes('No Google Reviews')) {
      const hasReviewWidget = await pageHtmlHasReviewWidget(data.lighthouseResult?.finalUrl || url);
      if (hasReviewWidget) {
        designIssues = designIssues.filter((i) => i !== 'No Testimonials' && i !== 'No Google Reviews');
        // The freeform impression sentence is the AI's own prose about that
        // same screenshot, so it can just as easily claim "no reviews are
        // shown" — fixing the checklist alone would leave that contradiction
        // sitting in the CRM notes and in outreach emails. Drop any clause
        // that mentions reviews/testimonials rather than trying to rewrite it.
        designImpression = designImpression
          ?.split(/(?<=[.!?])\s+/)
          .filter((sentence) => !/review|testimonial/i.test(sentence))
          .join(' ')
          .trim() || null;
      }
    }

    // Same idea, different cause: confirmed live on a real lead — a
    // Squarespace homepage genuinely has no form, but its /contact page
    // (linked from the nav) has a real, working Squarespace form block the
    // audit never looked at, since it only ever screenshots the one URL
    // it was given.
    if (designIssues.includes('No Contact Form')) {
      const hasContactForm = await pageOrContactPageHasForm(data.lighthouseResult?.finalUrl || url);
      if (hasContactForm) {
        designIssues = designIssues.filter((i) => i !== 'No Contact Form');
        designImpression = designImpression
          ?.split(/(?<=[.!?])\s+/)
          .filter((sentence) => !/contact form/i.test(sentence))
          .join(' ')
          .trim() || null;
      }
    }

    const issuesChecklist = [...new Set([...technicalIssues, ...designIssues])];

    const impressionParts = [`Auto-audited — PageSpeed performance ${performanceScore}/100.`];
    if (designImpression) {
      impressionParts.push(designImpression);
    } else if (screenshot) {
      // Distinguish "the AI looked and genuinely found nothing" (design is a
      // real object with an empty issues list) from "every vision provider
      // failed/rate-limited on this run" (design is null) — the latter looks
      // identical to a clean site otherwise, which is exactly what made a
      // failed run indistinguishable from a good one before this note.
      impressionParts.push('(AI visual check unavailable this run — technical checks only. Try Re-run Audit.)');
    }

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
      aiDesignNote: designImpression,
      aiVisualCheckFailed: Boolean(screenshot) && !design,
    };
  } catch (err) {
    const reason = err.response?.data?.error?.message ?? err.message;
    console.warn(`[websiteAudit] Audit failed for ${url}: ${reason}`);
    // PageSpeed returns an HTTP error (not a 200 with runtimeError) for a lot
    // of "the target site itself couldn't be reached" cases — DNS failure,
    // connection refused, the page timing out entirely. Those are worth a
    // real checklist entry so it reaches outreach, same as the 404 and
    // runtimeError cases above. Distinguished from our own infra hiccups
    // (PageSpeed rate-limited, bad API key, our own request timing out) by
    // matching on the known site-unreachable signals in the error text —
    // those shouldn't get blamed on the lead's site.
    if (/dns|name_not_resolved|connection_refused|connection_reset|err_connection|failed_document_request|errored_document_request|no_fcp|protocol_timeout|page_hung|could not be resolved|could not be loaded/i.test(reason)) {
      return {
        auditFailed: true,
        error: reason,
        issuesChecklist: ["Site Doesn't Load"],
        aiDesignNote: "your website didn't load at all when I tried to visit it — it may be down, misconfigured, or blocking automated visits",
      };
    }
    // Surfaced to the lead's notes instead of silently leaving fields blank —
    // "nothing found" and "audit couldn't even run" look identical otherwise.
    return { auditFailed: true, error: reason };
  }
}

module.exports = {
  auditWebsite,
  // Exported for unit testing only — deriveIssues, pickScreenshot, and the
  // review-widget regex have each caused a real production bug this app hit
  // (CLS threshold missing "needs improvement", meta-viewport audit
  // repurposed by Lighthouse, a JS-rendered review widget mis-read as "no
  // reviews"). None of these are meant to be used outside this module.
  deriveIssues,
  pickScreenshot,
  pageHtmlHasReviewWidget,
  REVIEW_WIDGET_PATTERNS,
  pageOrContactPageHasForm,
  CONTACT_LINK_RE,
};
