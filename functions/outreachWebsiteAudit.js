'use strict';

const axios = require('axios');
const nodeDns = require('dns').promises;
const net = require('net');

// Indirected through a mutable object (rather than calling nodeDns.lookup /
// axios.get directly) purely for testability — this project's Vitest setup
// doesn't reliably intercept `require()`'d modules via vi.mock for CJS
// source files (confirmed true for both a Node builtin, `dns`, and a
// regular npm package, `axios` — not something specific to builtins), so
// tests override these directly via the setters below instead. Production
// code never touches this — it's always the real implementation unless a
// test replaces it.
const deps = {
  dnsLookup: (hostname) => nodeDns.lookup(hostname, { all: true }),
  axiosGet: (url, config) => axios.get(url, config),
};

// Function calls (rather than mutating the exported `deps` object from
// outside) so the reassignment always happens inside THIS module's own
// closure — reliable across the ESM/CJS interop boundary tests load this
// module through, where mutating a destructured object export directly has
// been observed not to reliably propagate back to the module's internal
// reference. Test-only; production code never calls these.
function __setDnsLookupForTests(fn) {
  deps.dnsLookup = fn;
}
function __setAxiosGetForTests(fn) {
  deps.axiosGet = fn;
}

// ────────────────────────────────────────────────────────────────────────
// Outreach Website Check — a deliberately lightweight, INDEPENDENT website
// analyzer for prospecting. This is NOT the Growth Audit product
// (app.dean-da-dev.co.uk) and must never call it — Growth Audit's Browser
// Rendering / PageSpeed budget is a small, shared, metered resource that
// real customers depend on, and outreach volume (potentially dozens of
// prospects a day) would exhaust it. This module only ever does a plain
// HTTP fetch + regex-based HTML parsing — no headless browser, no
// Lighthouse, no PSI, no third-party audit API of any kind.
//
// Because there's no real browser here, this CANNOT measure genuine
// performance metrics (load time, LCP, PageSpeed score) — see
// buildPerformanceSignals() below, which only ever reports static,
// honestly-labelled signals (e.g. "N large image references found"), never
// a fabricated timing number.
// ────────────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2_000_000; // 2MB — a real HTML document is almost always well under this; anything bigger is either not a normal page or not worth downloading in full for a lightweight check
const MAX_REDIRECTS = 3;
const USER_AGENT = 'Mozilla/5.0 (compatible; OutreachWebsiteCheck/1.0; +https://dean-da-dev.co.uk)';

// ── Safe fetching (SSRF protection) ─────────────────────────────────────

function isPrivateOrReservedIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this network"
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.split(':').pop();
      if (net.isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true; // couldn't even parse it as an IP — refuse rather than guess
}

/**
 * Validates a URL is safe to fetch: http(s) only, not a bare/obvious local
 * hostname, and resolves to a public (non-private/loopback/link-local) IP.
 * Throws with a clear reason on failure — never silently proceeds.
 *
 * Known, accepted limitation: this re-resolves DNS on every redirect hop
 * (see fetchSafely below) rather than pinning the connection to the exact
 * IP it validated, so a sufficiently fast DNS-rebinding attack between the
 * lookup and the actual TCP connect is theoretically possible. Given this
 * tool is only ever run manually by the app's single owner against
 * prospects' own public business websites (not arbitrary user-submitted
 * URLs from the internet), that residual risk is accepted rather than
 * building full socket-level IP pinning.
 */
async function assertSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '0.0.0.0' || hostname === '[::1]') {
    throw new Error('Refusing to fetch a local address.');
  }
  let addresses;
  try {
    addresses = await deps.dnsLookup(hostname);
  } catch {
    throw new Error('Could not resolve this hostname.');
  }
  if (addresses.length === 0) throw new Error('Could not resolve this hostname.');
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error('Refusing to fetch a private/internal network address.');
    }
  }
  return parsed;
}

/**
 * Fetches a URL's HTML with SSRF protection, a hard size cap, a short
 * timeout, and manual (re-validated) redirect following — each redirect hop
 * is independently checked by assertSafeUrl before being followed, so a
 * public URL that redirects to an internal address is caught, not just the
 * original URL. Returns { finalUrl, status, html } or throws.
 */
async function fetchSafely(startUrl, { maxRedirects = MAX_REDIRECTS } = {}) {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await assertSafeUrl(currentUrl);
    const res = await deps.axiosGet(validated.toString(), {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: 0,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      responseType: 'text',
      validateStatus: () => true,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      transformResponse: [(data) => data], // keep as raw text, don't let axios try to parse JSON
    });

    if (res.status >= 300 && res.status < 400 && res.headers?.location) {
      currentUrl = new URL(res.headers.location, validated).toString();
      continue; // re-validated at the top of the next iteration
    }
    return { finalUrl: validated.toString(), status: res.status, html: typeof res.data === 'string' ? res.data : '' };
  }
  throw new Error('Too many redirects.');
}

// ── Cache / in-flight dedup ──────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes — long enough to avoid re-fetching while working a lead, short enough that a site fixed today shows up fresh tomorrow
const cache = new Map(); // key -> { expiresAt, result }
const inFlight = new Map(); // key -> Promise<result>

function normalizeUrlForCache(rawUrl) {
  try {
    const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.hostname.toLowerCase()}${path}`; // protocol/fragment/trailing-slash/casing-insensitive, matches Growth Audit's own dedup convention
  } catch {
    return String(rawUrl).trim().toLowerCase();
  }
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

// ── HTML parsing (regex-based — deliberately no DOM/cheerio dependency,
// consistent with keeping this analyzer lightweight) ────────────────────

function stripTagsToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAllTag(html, tagRegex) {
  return [...html.matchAll(tagRegex)];
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTagsToText(m[1]).trim() : '';
}

function extractMeta(html, name) {
  // Handles both attribute orders: name before content, or content before name.
  const re1 = new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i');
  return (html.match(re1) ?? html.match(re2))?.[1]?.trim() ?? '';
}

function extractHeadings(html) {
  const headings = [];
  for (const m of matchAllTag(html, /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = stripTagsToText(m[2]).trim();
    if (text) headings.push({ level: Number(m[1]), text });
  }
  return headings;
}

function extractLinks(html) {
  const links = [];
  for (const m of matchAllTag(html, /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (links.length >= 300) break; // sane cap — a lightweight check doesn't need every link on a huge nav
    const href = m[1].trim();
    const text = stripTagsToText(m[2]).trim();
    if (href) links.push({ href, text });
  }
  return links;
}

function extractImages(html) {
  const images = [];
  for (const m of matchAllTag(html, /<img\s[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/src=["']([^"']*)["']/i)?.[1] ?? '';
    const hasAlt = /\salt=["'][^"']*["']/i.test(tag);
    const altEmpty = /\salt=["']["']/i.test(tag);
    images.push({ src, hasAlt: hasAlt && !altEmpty });
  }
  return images;
}

function extractForms(html) {
  return matchAllTag(html, /<form[\s>]/gi).length;
}

// Many real contact forms aren't a literal <form> tag at all — they're an
// embedded third-party widget (an <iframe>/<script> pointing at a forms
// provider). Counting only literal <form> tags would falsely claim "no
// contact form" for a site that genuinely has one, just embedded — this
// checks for the common providers so that false claim doesn't happen.
const EMBEDDED_FORM_PROVIDERS = /(typeform\.com|jotform\.com|forms\.gle|docs\.google\.com\/forms|hsforms\.(com|net)|wufoo\.com|formspree\.io|tally\.so|123formbuilder\.com|paperform\.co|forms\.office\.com|cognitoforms\.com|gravityforms|ninjaforms|contact-form-7|wpforms)/i;
function hasEmbeddedFormProvider(html) {
  return EMBEDDED_FORM_PROVIDERS.test(html);
}

// "Buttons" for a static-HTML-only analyzer means real <button> elements
// plus link/button text that reads like a call-to-action (an <a> styled as
// a button can't be told apart from a plain link without rendering, so CTA
// wording is the honest signal available here).
function extractButtonLikeTexts(html) {
  const texts = [];
  for (const m of matchAllTag(html, /<button[^>]*>([\s\S]*?)<\/button>/gi)) {
    const text = stripTagsToText(m[1]).trim();
    if (text) texts.push(text);
  }
  return texts;
}

const CTA_WORDS = /(get a quote|request a quote|book now|book online|call now|contact us|get started|free quote|book an appointment|book a|enquire|schedule|get in touch|buy now|order now|message us|chat with us|start your project|speak to|reserve|make a booking)/i;

const PHONE_REGEX = /(\+44\s?\(?0?\)?\s?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})|(\b0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b)/;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const UK_POSTCODE_REGEX = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

const BOOKING_PROVIDERS = /(calendly\.com|acuityscheduling\.com|setmore\.com|book\.squareup\.com|square\.site|housecallpro\.com|getjobber\.com|vagaro\.com|fresha\.com|simplybook\.me|bookings\.microsoft\.com)/i;
const REVIEW_LINK_REGEX = /(g\.page|google\.com\/maps|goo\.gl\/maps|trustpilot\.com|checkatrade\.com|mybuilder\.com)/i;
const TESTIMONIAL_WORDS = /(testimonial|what our clients say|what customers say|customer review|verified review|\d\s?(star|out of 5))/i;
const TRUST_BADGE_WORDS = /(insured|accredited|guaranteed?|certified|award[- ]winning|checkatrade|trustpilot|which\?\s*trusted|feefo|iso\s?\d{4,5}|gas safe|niceic|federation of master builders|\bfmb\b|trustmark|fully insured|dbs checked)/i;
const PORTFOLIO_WORDS = /(portfolio|gallery|our work|case stud|before\s?(and|&)?\s?after|recent projects|completed projects)/i;
const FAQ_WORDS = /(frequently asked questions|\bfaqs?\b|common questions)/i;
const PRICING_WORDS = /(£\d|\$\d|€\d|\bfrom\s+£|\bpricing\b|price list|our prices)/i;
const HOURS_WORDS = /(opening hours|business hours|mon(day)?\s*-\s*fri(day)?|open\s+\d{1,2}(am|pm)|\d{1,2}(am|pm)\s*-\s*\d{1,2}(am|pm))/i;
const SERVICE_AREA_WORDS = /(we cover|areas we cover|service area|serving\s+[a-z]|covering\s+[a-z]+(,|\sand)|based in [a-z])/i;

// ── JS-shell detection (independent reimplementation — see module comment;
// same conservative multi-signal idea, not copied code) ─────────────────

function looksLikeJsAppShell({ wordCount, headings, forms, buttonTexts, htmlLength, bodyTextLength }) {
  const signals = [
    wordCount < 25,
    headings.length === 0,
    forms === 0 && buttonTexts.length === 0,
    htmlLength > 2000 && bodyTextLength < 200,
  ];
  return signals.filter(Boolean).length >= 3;
}

// ── Signal groups (matches the requested output shape) ──────────────────

function buildSeoSignals({ title, metaDescription, headings, canonicalPresent, robotsMeta, langAttr, viewportPresent }) {
  return {
    titlePresent: title.length > 0,
    titleLength: title.length,
    metaDescriptionPresent: metaDescription.length > 0,
    metaDescriptionLength: metaDescription.length,
    h1Count: headings.filter((h) => h.level === 1).length,
    headingCount: headings.length,
    canonicalPresent,
    robotsMeta: robotsMeta || null,
    langAttribute: langAttr || null,
    viewportPresent,
  };
}

function buildConversionSignals({ formsFound, embeddedFormFound, ctaMatches, phoneFound, emailFound, bookingLinkFound, pricingFound, faqFound }) {
  return { formsFound, embeddedFormFound, ctaOccurrences: ctaMatches, phoneFound, emailFound, bookingLinkFound, pricingFound, faqFound };
}

function buildTrustSignals({ testimonialSignal, reviewLinkFound, trustBadgeFound, portfolioFound }) {
  return { testimonialSignal, reviewLinkFound, trustBadgeFound, portfolioFound };
}

function buildLocalSignals({ postcodeFound, hoursFound, serviceAreaFound, mapsLinkFound, phoneFound }) {
  return { postcodeFound, hoursFound, serviceAreaFound, mapsLinkFound, phoneFound };
}

// Never a timing/score number — see the module comment. Only ever
// static, honestly-labelled signals a static HTML fetch can actually see.
function buildPerformanceSignals({ largeImageRefCount, totalImageCount, htmlSizeBytes }) {
  return {
    measured: false,
    reason: 'This lightweight check does not load a real browser, so it cannot measure load time, Core Web Vitals, or a PageSpeed-style score.',
    largeImageReferenceCount: largeImageRefCount,
    totalImageCount,
    htmlSizeBytes,
  };
}

// ── Finding construction ─────────────────────────────────────────────────

let findingCounter = 0;
function makeFinding({ id, category, severity, confidence, title, description, outreachText, evidence }) {
  findingCounter += 1;
  return { id, category, severity, confidence, title, description, outreachText, evidence };
}

/**
 * Builds the raw finding list from parsed signals. Business-facing findings
 * (conversion/trust/localSeo/mobile) are defined first and outnumber the
 * technical ones deliberately — see module comment and REQUIREMENT 4/10 in
 * the spec this implements: quality over quantity, and prefer things a
 * business owner immediately understands. Category-based business-type
 * prioritisation happens downstream in findingSelector.js, which already
 * has this logic — this function just needs to tag findings with the right
 * category (conversion/trust/localSeo/mobile/seo/accessibility), not
 * duplicate the business-type weighting itself.
 */
function evaluateFindings(signals, isShell) {
  const findings = [];
  const push = (f) => findings.push(makeFinding(f));

  // ── Conversion (highest outreach value) ──────────────────────────────
  // Only claims "no contact form" when there's neither a literal <form>,
  // a common embedded form widget (Typeform/JotForm/HubSpot/etc. — these
  // are real contact forms, just not a literal <form> tag), NOR a booking
  // link (a booking widget is itself a legitimate, direct way to get in
  // touch — claiming "no way to reach you" while one exists would be false).
  if (signals.conversion.formsFound === 0 && !signals.conversion.embeddedFormFound && !signals.conversion.bookingLinkFound && !isShell) {
    push({
      id: 'conversion.contactForm', category: 'conversion', severity: 'high', confidence: 'high',
      title: 'No contact form detected',
      description: 'No <form> elements, common embedded form widget, or booking link were found anywhere in the page HTML.',
      outreachText: "there doesn't seem to be a contact or enquiry form on the site, so anyone who doesn't want to call or email directly has no way to reach you",
      evidence: { formsFound: 0, embeddedFormFound: false, bookingLinkFound: false },
    });
  }
  if (signals.conversion.ctaOccurrences === 0 && !isShell) {
    push({
      id: 'conversion.primaryCta', category: 'conversion', severity: 'high', confidence: 'medium',
      title: 'No clear call-to-action found',
      description: 'No call-to-action phrasing (e.g. "Get a Quote", "Book Now", "Contact Us") was found in the page text or links.',
      outreachText: "the homepage doesn't have a clear call-to-action pointing visitors toward getting in touch",
      evidence: { ctaOccurrences: 0 },
    });
  }
  if (!signals.conversion.phoneFound && !signals.conversion.emailFound && !isShell) {
    push({
      id: 'conversion.noDirectContact', category: 'conversion', severity: 'high', confidence: 'high',
      title: 'No phone number or email address found',
      description: 'No phone number pattern, tel: link, mailto: link, or email address was found on the page.',
      outreachText: "there's no visible phone number or email address on the page, which is often the first thing someone looks for",
      evidence: { phoneNumbersFound: 0, emailAddressesFound: 0 },
    });
  }
  if (!signals.conversion.bookingLinkFound && !signals.conversion.pricingFound && !isShell) {
    push({
      id: 'conversion.pricingInfo', category: 'conversion', severity: 'medium', confidence: 'medium',
      title: 'No pricing information visible',
      description: 'No currency-prefixed pricing text or "pricing"/"price list" reference was found.',
      outreachText: "there's no pricing information visible, which is often something people look for before getting in touch",
      evidence: { pricingSignalsFound: 0 },
    });
  }
  if (!signals.conversion.faqFound && !isShell) {
    push({
      id: 'conversion.faqSection', category: 'conversion', severity: 'low', confidence: 'medium',
      title: 'No FAQ section found',
      description: 'No "FAQ"/"frequently asked questions" section was found.',
      outreachText: "there's no FAQ section answering the questions people usually have before getting in touch",
      evidence: { faqSignalsFound: 0 },
    });
  }

  // ── Trust ──────────────────────────────────────────────────────────
  if (!signals.trust.testimonialSignal && !isShell) {
    push({
      id: 'trust.testimonials', category: 'trust', severity: 'medium', confidence: 'medium',
      title: 'No testimonials or reviews shown',
      description: 'No testimonial/review wording or star-rating text was found on the page.',
      outreachText: "there aren't any reviews or testimonials shown on the site",
      evidence: { testimonialSignalsFound: 0 },
    });
  }
  if (!signals.trust.reviewLinkFound) {
    push({
      id: 'trust.googleReviews', category: 'trust', severity: 'medium', confidence: 'high',
      title: 'No Google reviews linked',
      description: 'No link to Google Maps/reviews, Trustpilot, or Checkatrade was found.',
      outreachText: 'your Google reviews (if you have them) aren\'t linked anywhere on the site',
      evidence: { reviewPlatformLinksFound: 0 },
    });
  }
  if (!signals.trust.portfolioFound && !isShell) {
    push({
      id: 'trust.portfolio', category: 'trust', severity: 'low', confidence: 'medium',
      title: 'No portfolio or past work shown',
      description: 'No "portfolio"/"gallery"/"our work"/"before and after" wording was found.',
      outreachText: "there's no gallery or examples of past work shown on the site",
      evidence: { portfolioSignalsFound: 0 },
    });
  }

  // ── Local business ────────────────────────────────────────────────
  if (!signals.local.postcodeFound && !signals.local.mapsLinkFound) {
    push({
      id: 'local.address', category: 'localSeo', severity: 'medium', confidence: 'medium',
      title: 'No business address found',
      description: 'No UK postcode pattern or Google Maps link/embed was found on the page.',
      outreachText: "it's not obvious from the site where you're actually based",
      evidence: { postcodeFound: false, mapsLinkFound: false },
    });
  }
  if (!signals.local.hoursFound) {
    push({
      id: 'local.hours', category: 'localSeo', severity: 'low', confidence: 'medium',
      title: 'No opening hours listed',
      description: 'No opening-hours-style text was found on the page.',
      outreachText: "opening hours aren't listed anywhere on the site",
      evidence: { hoursSignalsFound: 0 },
    });
  }
  if (!signals.local.serviceAreaFound) {
    push({
      id: 'local.serviceArea', category: 'localSeo', severity: 'low', confidence: 'low',
      title: 'Service area not clearly stated',
      description: 'No "areas we cover"/"serving [place]" style wording was found.',
      outreachText: "it's not clear which areas you actually cover",
      evidence: { serviceAreaSignalsFound: 0 },
    });
  }

  // ── Mobile / accessibility ────────────────────────────────────────
  if (!signals.seo.viewportPresent) {
    push({
      id: 'mobile.viewport', category: 'mobile', severity: 'high', confidence: 'high',
      title: 'No mobile viewport tag',
      description: 'No <meta name="viewport"> tag was found — a strong signal the page isn\'t configured for mobile devices.',
      outreachText: "there's an issue with how the site is set up for mobile devices — it's missing the tag that tells phones how to display the page properly",
      evidence: { viewportPresent: false },
    });
  }

  // ── SEO (technical — only surfaced when little else is available, see
  // findingSelector.js's existing category-preference tie-break which
  // already deprioritises these relative to conversion/trust/mobile) ──
  if (!signals.seo.titlePresent) {
    push({
      id: 'seo.missingTitle', category: 'seo', severity: 'high', confidence: 'high',
      title: 'No page title set',
      description: 'No <title> tag content was found on the homepage.',
      outreachText: "the homepage doesn't have a page title set, which search engines rely on heavily",
      evidence: { titlePresent: false },
    });
  } else if (!signals.seo.metaDescriptionPresent) {
    push({
      id: 'seo.missingMetaDescription', category: 'seo', severity: 'medium', confidence: 'high',
      title: 'No meta description set',
      description: 'No meta description content was found on the homepage.',
      outreachText: "there's no search-result description set, so Google is left to guess what to show under your listing",
      evidence: { metaDescriptionPresent: false },
    });
  } else if (signals.seo.h1Count === 0) {
    push({
      id: 'seo.missingH1', category: 'seo', severity: 'medium', confidence: isShell ? 'low' : 'high',
      title: 'No main heading (H1) found',
      description: 'No H1 heading was found in the page HTML.',
      outreachText: "the homepage doesn't have a clear main heading, which search engines use to understand what the page is about",
      evidence: { h1Count: 0 },
    });
  }

  // ── JS-shell caveat — neutral, low-priority, only surfaced as primary
  // when nothing stronger was found (see selectTopFindings' own ranking,
  // which will only pick this up if nothing else outranks it). ────────
  if (isShell) {
    push({
      id: 'technical.renderingRequired', category: 'accessibility', severity: 'low', confidence: 'low',
      title: 'Site appears to rely heavily on JavaScript',
      description: 'The static HTML has very little visible content, no headings, and no forms/buttons — consistent with a client-rendered app shell rather than a genuinely empty page.',
      outreachText: 'some content on the site could not be checked because it appears to load in via JavaScript rather than being in the page itself',
      evidence: { likelyJsShell: true },
    });
  }

  return findings;
}

// ── Priority / adapter — converts raw findings into the same shape
// findingSelector.js/growthAuditOutreachWriter.js already consume, so
// NEITHER of those files needs a rewrite, only the one-line outreachText
// passthrough already noted in findingSelector.js. ───────────────────────

const SEVERITY_WEIGHT = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const CONFIDENCE_WEIGHT = { high: 3, medium: 2, low: 1 };
const CONFIDENCE_TO_DETECTION_METHOD = { high: 'detected', medium: 'detected', low: 'inferred' };
const SEVERITY_TO_IMPACT = { critical: 'high', high: 'high', medium: 'medium', low: 'low', info: 'low' };

function findingToRecommendation(finding, pageUrl) {
  return {
    id: finding.id,
    category: finding.category,
    title: finding.title,
    description: finding.description,
    outreachText: finding.outreachText,
    severity: finding.severity,
    impact: SEVERITY_TO_IMPACT[finding.severity] ?? 'medium',
    priority: (SEVERITY_WEIGHT[finding.severity] ?? 2) * 10 + (CONFIDENCE_WEIGHT[finding.confidence] ?? 1),
    aiGenerated: false,
    evidence: Object.entries(finding.evidence ?? {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', '),
    affectedUrl: pageUrl,
    detectionMethod: CONFIDENCE_TO_DETECTION_METHOD[finding.confidence] ?? 'detected',
  };
}

/**
 * Wraps analyzeWebsiteForOutreach's output in the same shape
 * findingSelector.selectTopFindings(audit, opts) already expects
 * (audit.recommendations) — lets the existing finding selector, outreach
 * writer, and quality gate run completely unmodified (besides the one
 * outreachText passthrough line) against this new, independent data source.
 */
function toGrowthAuditShapedResult(analysis) {
  return {
    url: analysis.url,
    scannedAt: analysis.scannedAt,
    overallScore: null, // this analyzer has no comparable 0-100 scoring concept — never invent one
    categories: [],
    recommendations: analysis.findings
      .map((f) => findingToRecommendation(f, analysis.url))
      .sort((a, b) => b.priority - a.priority),
    meta: {
      partial: analysis.status !== 'ok',
      warnings: analysis.status === 'error' ? [analysis.reason ?? 'Website could not be checked.'] : [],
      scanQuality: { scannedAt: analysis.scannedAt, jsRenderingUsed: false, performanceMeasured: false },
    },
  };
}

// ── Main entry point ──────────────────────────────────────────────────

/**
 * Runs a lightweight, non-browser website check for outreach purposes.
 * Never throws for a bad/unreachable site — returns a `status: 'error'`
 * result instead, with `findings: []`, so callers can handle it uniformly.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {boolean} [opts.skipCache]
 * @returns {Promise<object>}
 */
async function analyzeWebsiteForOutreach(url, opts = {}) {
  const cacheKey = normalizeUrlForCache(url);
  pruneExpired();

  if (!opts.skipCache) {
    const cached = cache.get(cacheKey);
    if (cached) return cached.result;
    const existingInFlight = inFlight.get(cacheKey);
    if (existingInFlight) return existingInFlight;
  }

  const promise = runAnalysis(url).then((result) => {
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    inFlight.delete(cacheKey);
    return result;
  }).catch((err) => {
    inFlight.delete(cacheKey);
    throw err;
  });

  inFlight.set(cacheKey, promise);
  return promise;
}

async function runAnalysis(rawUrl) {
  const scannedAt = new Date().toISOString();
  const inputUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  let fetched;
  try {
    fetched = await fetchSafely(inputUrl);
  } catch (err) {
    return {
      url: inputUrl, scannedAt, status: 'error', reason: err.message,
      title: '', metaDescription: '', headings: [], wordCount: 0, links: [], forms: 0, buttons: [], images: [],
      viewport: false, performanceSignals: null, trustSignals: null, conversionSignals: null, seoSignals: null,
      renderingRequired: false, findings: [],
    };
  }

  if (fetched.status < 200 || fetched.status >= 300) {
    return {
      url: fetched.finalUrl, scannedAt, status: 'error', reason: `Website returned HTTP ${fetched.status}.`,
      title: '', metaDescription: '', headings: [], wordCount: 0, links: [], forms: 0, buttons: [], images: [],
      viewport: false, performanceSignals: null, trustSignals: null, conversionSignals: null, seoSignals: null,
      renderingRequired: false, findings: [],
    };
  }

  const html = fetched.html;
  const bodyText = stripTagsToText(html);
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
  const title = extractTitle(html);
  const metaDescription = extractMeta(html, 'description');
  const robotsMeta = extractMeta(html, 'robots');
  const headings = extractHeadings(html);
  const links = extractLinks(html);
  const images = extractImages(html);
  const forms = extractForms(html);
  const buttonTexts = extractButtonLikeTexts(html);
  const viewportPresent = /<meta[^>]+name=["']viewport["']/i.test(html);
  const canonicalPresent = /<link[^>]+rel=["']canonical["']/i.test(html);
  const langAttr = html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i)?.[1] ?? '';

  const linkTexts = links.map((l) => l.text).join(' ');
  const linkHrefs = links.map((l) => l.href).join(' ');
  const ctaCandidateText = `${bodyText} ${buttonTexts.join(' ')} ${linkTexts}`;
  const ctaMatches = (ctaCandidateText.match(new RegExp(CTA_WORDS.source, 'gi')) ?? []).length;

  const phoneFound = /href=["']tel:/i.test(html) || PHONE_REGEX.test(bodyText);
  const emailFound = /href=["']mailto:/i.test(html) || EMAIL_REGEX.test(bodyText);
  const bookingLinkFound = BOOKING_PROVIDERS.test(html) || /(book now|book online|book an appointment|book a call|make a booking)/i.test(ctaCandidateText);
  const embeddedFormFound = hasEmbeddedFormProvider(html);
  const pricingFound = PRICING_WORDS.test(bodyText) || /pric(e|ing)/i.test(linkHrefs);
  const faqFound = FAQ_WORDS.test(bodyText);
  const testimonialSignal = TESTIMONIAL_WORDS.test(bodyText);
  const reviewLinkFound = REVIEW_LINK_REGEX.test(html);
  const trustBadgeFound = TRUST_BADGE_WORDS.test(bodyText);
  const portfolioFound = PORTFOLIO_WORDS.test(bodyText) || PORTFOLIO_WORDS.test(linkHrefs);
  const postcodeFound = UK_POSTCODE_REGEX.test(bodyText);
  const mapsLinkFound = /(google\.com\/maps|maps\.google|goo\.gl\/maps)/i.test(html);
  const hoursFound = HOURS_WORDS.test(bodyText);
  const serviceAreaFound = SERVICE_AREA_WORDS.test(bodyText);

  const isShell = looksLikeJsAppShell({ wordCount, headings, forms, buttonTexts, htmlLength: html.length, bodyTextLength: bodyText.length });

  const largeImageRefCount = images.filter((img) => /\.(jpg|jpeg|png)(\?|$)/i.test(img.src) && !/\.(webp|avif)(\?|$)/i.test(img.src)).length;

  const seoSignals = buildSeoSignals({ title, metaDescription, headings, canonicalPresent, robotsMeta, langAttr, viewportPresent });
  const conversionSignals = buildConversionSignals({ formsFound: forms, embeddedFormFound, ctaMatches, phoneFound, emailFound, bookingLinkFound, pricingFound, faqFound });
  const trustSignals = buildTrustSignals({ testimonialSignal, reviewLinkFound, trustBadgeFound, portfolioFound });
  const localSignals = buildLocalSignals({ postcodeFound, hoursFound, serviceAreaFound, mapsLinkFound, phoneFound });
  const performanceSignals = buildPerformanceSignals({ largeImageRefCount, totalImageCount: images.length, htmlSizeBytes: Buffer.byteLength(html, 'utf8') });

  const findings = evaluateFindings(
    { seo: seoSignals, conversion: conversionSignals, trust: trustSignals, local: localSignals },
    isShell,
  );

  return {
    url: fetched.finalUrl,
    scannedAt,
    status: isShell ? 'partial' : 'ok',
    reason: isShell ? 'Website appears to rely heavily on JavaScript — some content-dependent findings were reduced in confidence or skipped.' : null,
    title,
    metaDescription,
    headings,
    wordCount,
    links,
    forms,
    buttons: buttonTexts,
    images,
    viewport: viewportPresent,
    performanceSignals,
    trustSignals,
    conversionSignals,
    seoSignals,
    localSignals,
    renderingRequired: isShell,
    findings,
  };
}

module.exports = {
  analyzeWebsiteForOutreach,
  toGrowthAuditShapedResult,
  normalizeUrlForCache,
  looksLikeJsAppShell,
  assertSafeUrl,
  isPrivateOrReservedIp,
  // exported for tests only
  _internal: {
    extractTitle, extractMeta, extractHeadings, extractLinks, extractImages, extractForms, stripTagsToText,
    evaluateFindings, findingToRecommendation, deps, hasEmbeddedFormProvider,
    setDnsLookupForTests: __setDnsLookupForTests,
    setAxiosGetForTests: __setAxiosGetForTests,
  },
};
