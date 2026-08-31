import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  analyzeWebsiteForOutreach,
  toGrowthAuditShapedResult,
  normalizeUrlForCache,
  looksLikeJsAppShell,
  assertSafeUrl,
  isPrivateOrReservedIp,
  _internal,
} from './outreachWebsiteAudit.js';
import { selectTopFindings } from './findingSelector.js';
import { assessOutreachQuality } from './outreachQuality.js';
import { buildInitialPrompt } from './growthAuditOutreachWriter.js';

const PUBLIC_IP = [{ address: '203.0.113.10', family: 4 }];

// Neither `dns` (a Node builtin) nor `axios` (a regular npm package) get
// reliably intercepted by vi.mock() for this project's CJS source files —
// confirmed for both, not something specific to builtins. The source module
// exposes both as overridable dependencies (_internal.deps) instead of
// fighting that; the setter functions (rather than mutating the exported
// `deps` object directly) are what reliably propagate the override back
// into the module's own closure — see outreachWebsiteAudit.js's comment.
const axiosGet = vi.fn();
_internal.setAxiosGetForTests(axiosGet);

function mockDnsLookup(fn) {
  _internal.setDnsLookupForTests(fn);
}
function mockPublicDns() {
  mockDnsLookup(() => Promise.resolve(PUBLIC_IP));
}

function mockHtml(html, status = 200, headers = {}) {
  axiosGet.mockResolvedValue({ status, data: html, headers });
}

function fullPageHtml({ title = 'Riverside Plumbing | 24/7 Emergency Plumber', metaDescription = 'Fast, reliable plumbing services across the county. Call today for a free quote.', extra = '' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <title>${title}</title>
  <meta name="description" content="${metaDescription}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.com/">
</head>
<body>
  <h1>Riverside Plumbing</h1>
  <p>We are a family-run plumbing business serving Riverside and the surrounding area for over 20 years. Call us on 01234 567890 or email info@example.com.</p>
  <p>SW1A 1AA</p>
  <p>Open Monday-Friday 8am-6pm</p>
  <p>We cover Riverside, Norton and surrounding villages.</p>
  <p>What our clients say: "Brilliant service, 5 out of 5"</p>
  <a href="https://google.com/maps/place/riverside-plumbing">Find us on Google Maps</a>
  <a href="tel:01234567890">Call now</a>
  <form><input name="email"/></form>
  <a href="/contact">Get a quote</a>
  ${extra}
</body>
</html>`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Architecture: never calls the Growth Audit product ──────────────────

describe('architecture — no dependency on Growth Audit / browser rendering / PSI', () => {
  it('does not import or reference the Growth Audit audit endpoint anywhere in this file', () => {
    const source = fs.readFileSync(path.join(__dirname, 'outreachWebsiteAudit.js'), 'utf8');
    expect(source).not.toContain('app.dean-da-dev.co.uk/api/audit');
    // Checks for actual usage (require/import/new/instantiation), not bare
    // mentions — the module's own comments explicitly document that it does
    // NOT use these, which would otherwise trip a naive substring check.
    expect(source).not.toMatch(/require\(['"](puppeteer|playwright|lighthouse)['"]\)/i);
    expect(source).not.toMatch(/\bnew\s+(Puppeteer|Playwright|Lighthouse)\b/);
    expect(source).not.toMatch(/pagespeedonline\.googleapis\.com/i);
  });

  it('index.js no longer imports growthAuditClient (removed) and runGrowthAuditForLead uses the lightweight analyzer', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    expect(source).not.toContain("require('./growthAuditClient')");
    expect(source).toContain("require('./outreachWebsiteAudit')");
  });

  it('growthAuditClient.js no longer exists', () => {
    expect(fs.existsSync(path.join(__dirname, 'growthAuditClient.js'))).toBe(false);
  });

  it('never makes an HTTP request to app.dean-da-dev.co.uk while analysing an unrelated site', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    await analyzeWebsiteForOutreach('https://a-real-prospect.example.com', { skipCache: true });
    for (const call of axiosGet.mock.calls) {
      expect(String(call[0])).not.toContain('dean-da-dev.co.uk');
    }
  });
});

// ── SSRF / safe fetching ──────────────────────────────────────────────────

describe('isPrivateOrReservedIp', () => {
  it.each([
    ['10.0.0.5', true], ['127.0.0.1', true], ['169.254.1.1', true], ['172.16.0.1', true],
    ['192.168.1.1', true], ['100.64.0.1', true], ['0.0.0.0', true],
    ['203.0.113.10', false], ['8.8.8.8', false],
  ])('%s -> private=%s', (ip, expected) => {
    expect(isPrivateOrReservedIp(ip)).toBe(expected);
  });

  it('treats loopback and unique-local IPv6 as private', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(/http/i);
    await expect(assertSafeUrl('ftp://example.com')).rejects.toThrow(/http/i);
  });

  it('rejects obviously local hostnames without even resolving DNS', async () => {
    await expect(assertSafeUrl('http://localhost/')).rejects.toThrow(/local/i);
  });

  it('rejects a bare loopback IP address via the DNS-resolution path (not literally "localhost", but still resolves to a private/loopback address)', async () => {
    mockDnsLookup(() => Promise.resolve([{ address: '127.0.0.1', family: 4 }]));
    await expect(assertSafeUrl('http://127.0.0.1/')).rejects.toThrow(/private|internal/i);
  });

  it('rejects a hostname that resolves to a private IP', async () => {
    mockDnsLookup(() => Promise.resolve([{ address: '10.0.0.5', family: 4 }]));
    await expect(assertSafeUrl('http://internal.example.com/')).rejects.toThrow(/private|internal/i);
  });

  it('rejects an invalid URL', async () => {
    await expect(assertSafeUrl('not a url')).rejects.toThrow(/invalid/i);
  });

  it('allows a hostname that resolves to a public IP', async () => {
    mockPublicDns();
    await expect(assertSafeUrl('https://a-real-business.example.com/')).resolves.toBeInstanceOf(URL);
  });
});

// ── URL normalisation / caching / dedup ──────────────────────────────────

describe('normalizeUrlForCache', () => {
  it('is protocol, case, and trailing-slash insensitive', () => {
    expect(normalizeUrlForCache('https://Example.com/')).toBe(normalizeUrlForCache('http://example.com'));
  });
  it('treats different paths as different keys', () => {
    expect(normalizeUrlForCache('https://example.com/a')).not.toBe(normalizeUrlForCache('https://example.com/b'));
  });
  it('never throws on malformed input', () => {
    expect(() => normalizeUrlForCache('###')).not.toThrow();
  });
});

describe('analyzeWebsiteForOutreach — caching/deduplication', () => {
  it('does not re-fetch the same normalized URL within the cache TTL', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    await analyzeWebsiteForOutreach('https://cache-test.example.com/');
    await analyzeWebsiteForOutreach('https://cache-test.example.com'); // no trailing slash, same normalized key
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it('skipCache forces a fresh fetch', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    await analyzeWebsiteForOutreach('https://skip-cache-test.example.com/');
    await analyzeWebsiteForOutreach('https://skip-cache-test.example.com/', { skipCache: true });
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('concurrent requests for the same URL share one in-flight fetch', async () => {
    mockPublicDns();
    let resolveAxios;
    axiosGet.mockReturnValue(new Promise((resolve) => { resolveAxios = resolve; }));
    const p1 = analyzeWebsiteForOutreach('https://concurrent-test.example.com/');
    const p2 = analyzeWebsiteForOutreach('https://concurrent-test.example.com/');
    resolveAxios({ status: 200, data: fullPageHtml(), headers: {} });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(r1.url).toBe(r2.url);
  });
});

// ── Fetch error handling ─────────────────────────────────────────────────

describe('analyzeWebsiteForOutreach — fetch failures', () => {
  it('handles a timeout without throwing — returns status: error', async () => {
    mockPublicDns();
    axiosGet.mockRejectedValue(Object.assign(new Error('timeout of 8000ms exceeded'), { code: 'ECONNABORTED' }));
    const result = await analyzeWebsiteForOutreach('https://timeout-test.example.com/', { skipCache: true });
    expect(result.status).toBe('error');
    expect(result.findings).toEqual([]);
  });

  it('handles an HTTP error status honestly', async () => {
    mockPublicDns();
    mockHtml('<html></html>', 500);
    const result = await analyzeWebsiteForOutreach('https://http-error-test.example.com/', { skipCache: true });
    expect(result.status).toBe('error');
    expect(result.reason).toMatch(/500/);
  });

  it('handles an oversized-response rejection from axios without throwing', async () => {
    mockPublicDns();
    axiosGet.mockRejectedValue(new Error('maxContentLength size of 2000000 exceeded'));
    const result = await analyzeWebsiteForOutreach('https://oversized-test.example.com/', { skipCache: true });
    expect(result.status).toBe('error');
  });

  it('follows a redirect and analyses the final destination', async () => {
    mockPublicDns();
    axiosGet
      .mockResolvedValueOnce({ status: 301, data: '', headers: { location: 'https://redirect-target.example.com/' } })
      .mockResolvedValueOnce({ status: 200, data: fullPageHtml(), headers: {} });
    const result = await analyzeWebsiteForOutreach('https://redirect-source.example.com/', { skipCache: true });
    expect(result.status).toBe('ok');
    expect(result.url).toBe('https://redirect-target.example.com/');
  });

  it('rejects a redirect chain that is too long', async () => {
    mockPublicDns();
    axiosGet.mockImplementation((url) => Promise.resolve({ status: 302, data: '', headers: { location: url + '/next' } }));
    const result = await analyzeWebsiteForOutreach('https://infinite-redirect-test.example.com/', { skipCache: true });
    expect(result.status).toBe('error');
  });

  it('never crashes on malformed/broken HTML', async () => {
    mockPublicDns();
    mockHtml('<html><body><div><p>Unclosed tags everywhere <span><h1>oops');
    const result = await analyzeWebsiteForOutreach('https://malformed-html-test.example.com/', { skipCache: true });
    expect(result.status === 'ok' || result.status === 'partial').toBe(true);
  });
});

// ── Social-media-as-website ──────────────────────────────────────────────
// A lead's "website" is sometimes actually an Instagram/Facebook page —
// analysing that URL would report on Instagram/Facebook's own HTML, not the
// business, and read as nonsense in outreach. These must never fetch at all.

describe('analyzeWebsiteForOutreach — social-media-only "websites"', () => {
  it.each([
    ['https://www.instagram.com/riversideplumbing/', 'Instagram'],
    ['https://instagram.com/riversideplumbing', 'Instagram'],
    ['https://www.facebook.com/RiversidePlumbing', 'Facebook'],
    ['https://facebook.com/RiversidePlumbing', 'Facebook'],
  ])('detects %s as %s without fetching it', async (url, platform) => {
    const result = await analyzeWebsiteForOutreach(url, { skipCache: true });
    expect(axiosGet).not.toHaveBeenCalled();
    expect(result.status).toBe('ok');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence.socialPlatform).toBe(platform);
    expect(result.findings[0].outreachText).toMatch(new RegExp(platform));
  });

  it('still fetches a real business website normally, unaffected by the social-only check', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const result = await analyzeWebsiteForOutreach('https://a-real-plumber.example.com/', { skipCache: true });
    expect(axiosGet).toHaveBeenCalled();
    expect(result.status).toBe('ok');
  });

  it('flows through findingSelector as a top, hasEnough finding', async () => {
    const analysis = await analyzeWebsiteForOutreach('https://www.instagram.com/riversideplumbing/', { skipCache: true });
    const audit = toGrowthAuditShapedResult(analysis);
    const { findings, hasEnough } = selectTopFindings(audit, {});
    expect(hasEnough).toBe(true);
    expect(findings[0].id ?? findings[0].title).toBeTruthy();
  });
});

// ── HTML parsing helpers ─────────────────────────────────────────────────

describe('HTML parsing helpers', () => {
  it('extractTitle finds the <title> content', () => {
    expect(_internal.extractTitle('<html><head><title>Hello World</title></head></html>')).toBe('Hello World');
  });
  it('extractMeta finds a description regardless of attribute order', () => {
    expect(_internal.extractMeta('<meta name="description" content="A test.">', 'description')).toBe('A test.');
    expect(_internal.extractMeta('<meta content="A test." name="description">', 'description')).toBe('A test.');
  });
  it('extractHeadings finds headings and strips inner tags', () => {
    const headings = _internal.extractHeadings('<h1>Welcome <b>to</b> our site</h1><h2>About</h2>');
    expect(headings).toEqual([{ level: 1, text: 'Welcome to our site' }, { level: 2, text: 'About' }]);
  });
  it('extractForms counts form tags', () => {
    expect(_internal.extractForms('<form></form><div><form></form></div>')).toBe(2);
  });
  it('stripTagsToText removes scripts/styles and decodes basic entities', () => {
    const text = _internal.stripTagsToText('<script>evil()</script><p>Fish &amp; Chips</p><style>.x{}</style>');
    expect(text).toBe('Fish & Chips');
  });
});

// ── Full-page finding scenarios ──────────────────────────────────────────

describe('analyzeWebsiteForOutreach — finding scenarios', () => {
  it('a complete, well-built page produces few or no findings', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const result = await analyzeWebsiteForOutreach('https://good-site.example.com/', { skipCache: true });
    expect(result.status).toBe('ok');
    const ids = result.findings.map((f) => f.id);
    expect(ids).not.toContain('conversion.contactForm');
    expect(ids).not.toContain('conversion.noDirectContact');
    expect(ids).not.toContain('mobile.viewport');
  });

  it('detects a missing title', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml({ title: '' }).replace('<title></title>', ''));
    const result = await analyzeWebsiteForOutreach('https://no-title.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'seo.missingTitle')).toBe(true);
  });

  it('detects a missing meta description', async () => {
    mockPublicDns();
    const html = fullPageHtml().replace(/<meta name="description"[^>]*>/, '');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://no-meta.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'seo.missingMetaDescription')).toBe(true);
  });

  it('detects a missing H1', async () => {
    mockPublicDns();
    const html = fullPageHtml().replace('<h1>Riverside Plumbing</h1>', '<h2>Riverside Plumbing</h2>');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://no-h1.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'seo.missingH1')).toBe(true);
  });

  it('detects no contact form', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml().replace('<form><input name="email"/></form>', ''));
    const result = await analyzeWebsiteForOutreach('https://no-form.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'conversion.contactForm')).toBe(true);
  });

  it('honesty: does NOT claim a missing contact form when an embedded form widget (e.g. Typeform) is present instead of a literal <form> tag', async () => {
    mockPublicDns();
    const html = fullPageHtml()
      .replace('<form><input name="email"/></form>', '<iframe src="https://riverside.typeform.com/to/abc123" title="Contact"></iframe>');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://embedded-form.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'conversion.contactForm')).toBe(false);
  });

  it('honesty: does NOT claim a missing contact form when a booking link is present — a booking widget is itself a legitimate way to get in touch', async () => {
    mockPublicDns();
    const html = fullPageHtml()
      .replace('<form><input name="email"/></form>', '<a href="https://riverside.calendly.com/consult">Book a call</a>');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://booking-only.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'conversion.contactForm')).toBe(false);
  });

  it('honesty: does NOT claim a missing CTA when the page clearly contains one', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml()); // has "Get a quote" and "Call now"
    const result = await analyzeWebsiteForOutreach('https://has-cta.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'conversion.primaryCta')).toBe(false);
  });

  it('honesty: does NOT claim missing phone/email when detectable contact information exists', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml()); // has tel: link and an email address in the body text
    const result = await analyzeWebsiteForOutreach('https://has-contact.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'conversion.noDirectContact')).toBe(false);
  });

  it('honesty: does NOT claim missing testimonials/reviews/portfolio when clear evidence exists', async () => {
    mockPublicDns();
    const html = fullPageHtml({
      extra: '<div class="gallery">Our work: before and after photos of recent projects</div><a href="https://trustpilot.com/review/riverside-plumbing.co.uk">Trustpilot reviews</a>',
    });
    mockHtml(html); // already has "What our clients say" testimonial text and a Google Maps link
    const result = await analyzeWebsiteForOutreach('https://has-trust.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'trust.testimonials')).toBe(false);
    expect(result.findings.some((f) => f.id === 'trust.googleReviews')).toBe(false);
    expect(result.findings.some((f) => f.id === 'trust.portfolio')).toBe(false);
  });

  it('honesty: never produces a finding whose id or title references LCP/FCP/CLS/TBT/PageSpeed/Lighthouse, or any numeric score', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml().replace('<form><input name="email"/></form>', ''));
    const result = await analyzeWebsiteForOutreach('https://no-fake-metrics.example.com/', { skipCache: true });
    const bannedPattern = /\b(LCP|FCP|CLS|TBT|PageSpeed|Lighthouse)\b/i;
    const scorePattern = /\b\d{1,3}\s*\/\s*100\b/;
    for (const f of result.findings) {
      expect(f.title).not.toMatch(bannedPattern);
      expect(f.description).not.toMatch(bannedPattern);
      expect(f.outreachText).not.toMatch(bannedPattern);
      expect(f.title).not.toMatch(scorePattern);
      expect(f.outreachText).not.toMatch(scorePattern);
    }
  });

  it('honesty: does not present itself as "Growth Audit" or a "full audit" anywhere in the result shape', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const result = await analyzeWebsiteForOutreach('https://not-growth-audit.example.com/', { skipCache: true });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/growth audit/i);
    expect(serialised).not.toMatch(/full audit/i);
  });

  it('detects no CTA', async () => {
    mockPublicDns();
    // "Call now" (the tel: link's text) is itself a CTA phrase, so it must
    // be removed too, not just the "Get a quote" link, for this page to
    // genuinely have zero CTA occurrences.
    const html = fullPageHtml()
      .replace('<a href="/contact">Get a quote</a>', '')
      .replace('<a href="tel:01234567890">Call now</a>', '');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://no-cta.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'conversion.primaryCta')).toBe(true);
  });

  it('detects no phone and no email', async () => {
    mockPublicDns();
    const html = fullPageHtml().replace('<a href="tel:01234567890">Call now</a>', '').replace(/Call us on[^.]*\./, '').replace(/email info@example\.com/, '');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://no-contact-info.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'conversion.noDirectContact')).toBe(true);
  });

  it('detects no testimonials', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml().replace(/What our clients say:.*?<\/p>/, ''));
    const result = await analyzeWebsiteForOutreach('https://no-testimonials.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'trust.testimonials')).toBe(true);
  });

  it('detects no Google reviews link', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml().replace(/<a href="https:\/\/google\.com\/maps.*?<\/a>/, ''));
    const result = await analyzeWebsiteForOutreach('https://no-reviews.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'trust.googleReviews')).toBe(true);
  });

  it('detects no booking link and no pricing (conversion.pricingInfo fires when neither is present)', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const result = await analyzeWebsiteForOutreach('https://no-booking.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'conversion.pricingInfo')).toBe(true);
  });

  it('detects no portfolio/past work shown', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const result = await analyzeWebsiteForOutreach('https://no-portfolio.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'trust.portfolio')).toBe(true);
  });

  it('detects a missing viewport tag', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml().replace(/<meta name="viewport"[^>]*>/, ''));
    const result = await analyzeWebsiteForOutreach('https://no-viewport.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'mobile.viewport')).toBe(true);
  });

  it('detects local-business signals (address/hours/service area) when present, and their absence when not', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const withSignals = await analyzeWebsiteForOutreach('https://has-local.example.com/', { skipCache: true });
    expect(withSignals.findings.some((f) => f.id === 'local.address')).toBe(false);
    expect(withSignals.findings.some((f) => f.id === 'local.hours')).toBe(false);

    const stripped = fullPageHtml()
      .replace('<p>We are a family-run plumbing business serving Riverside and the surrounding area for over 20 years. Call us on 01234 567890 or email info@example.com.</p>', '<p>Call us on 01234 567890 or email info@example.com.</p>')
      .replace('<p>SW1A 1AA</p>', '')
      .replace('<p>Open Monday-Friday 8am-6pm</p>', '')
      .replace('<p>We cover Riverside, Norton and surrounding villages.</p>', '')
      .replace(/<a href="https:\/\/google\.com\/maps.*?<\/a>/, '');
    mockHtml(stripped);
    const withoutSignals = await analyzeWebsiteForOutreach('https://no-local.example.com/', { skipCache: true });
    expect(withoutSignals.findings.some((f) => f.id === 'local.address')).toBe(true);
    expect(withoutSignals.findings.some((f) => f.id === 'local.hours')).toBe(true);
    expect(withoutSignals.findings.some((f) => f.id === 'local.serviceArea')).toBe(true);
  });

  // Regression: a postcode/hours/review block that only exists inside a
  // <script type="application/ld+json"> tag never appeared in bodyText
  // (which strips all <script> content) — very common in practice, since
  // Yoast/RankMath and similar SEO plugins auto-inject a LocalBusiness
  // schema block even when the page itself never shows the address as
  // visible text. These findings falsely fired despite the info being
  // genuinely present on the page.
  it('honesty: does NOT claim a missing address when it only exists in JSON-LD schema, not visible page text', async () => {
    mockPublicDns();
    const html = fullPageHtml({
      extra: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Riverside Plumbing","address":{"@type":"PostalAddress","streetAddress":"12 River Lane","addressLocality":"Riverside","postalCode":"SW1A 1AA"}}</script>`,
    }).replace('<p>SW1A 1AA</p>', '');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://jsonld-address.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'local.address')).toBe(false);
  });

  it('honesty: does NOT claim missing opening hours when only declared via JSON-LD openingHoursSpecification', async () => {
    mockPublicDns();
    const html = fullPageHtml({
      extra: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":"Monday","opens":"08:00","closes":"18:00"}]}</script>`,
    }).replace('<p>Open Monday-Friday 8am-6pm</p>', '');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://jsonld-hours.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'local.hours')).toBe(false);
  });

  it('honesty: does NOT claim missing testimonials/reviews when only a JSON-LD aggregateRating block is present, with no visible review text', async () => {
    mockPublicDns();
    const html = fullPageHtml({
      extra: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"87"}}</script>`,
    }).replace(/What our clients say:.*?<\/p>/, '').replace(/<a href="https:\/\/google\.com\/maps.*?<\/a>/, '');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://jsonld-reviews.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'trust.testimonials')).toBe(false);
    expect(result.findings.some((f) => f.id === 'trust.googleReviews')).toBe(false);
  });

  it('honesty: does NOT claim missing reviews when a review widget (Elfsight/Trustindex) is embedded, even with no visible review text', async () => {
    mockPublicDns();
    const html = fullPageHtml({
      extra: `<div class="elfsight-app-abc123" data-elfsight-app-lazy></div><script src="https://static.elfsight.com/platform/platform.js" async></script>`,
    }).replace(/What our clients say:.*?<\/p>/, '').replace(/<a href="https:\/\/google\.com\/maps.*?<\/a>/, '');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://widget-reviews.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'trust.testimonials')).toBe(false);
    expect(result.findings.some((f) => f.id === 'trust.googleReviews')).toBe(false);
  });

  it('still correctly detects a genuinely missing address/hours/reviews when neither visible text nor JSON-LD/widget markers are present', async () => {
    mockPublicDns();
    const html = fullPageHtml()
      .replace('<p>SW1A 1AA</p>', '')
      .replace('<p>Open Monday-Friday 8am-6pm</p>', '')
      .replace(/What our clients say:.*?<\/p>/, '')
      .replace(/<a href="https:\/\/google\.com\/maps.*?<\/a>/, '');
    mockHtml(html);
    const result = await analyzeWebsiteForOutreach('https://genuinely-missing.example.com/', { skipCache: true });
    expect(result.findings.some((f) => f.id === 'local.address')).toBe(true);
    expect(result.findings.some((f) => f.id === 'local.hours')).toBe(true);
    expect(result.findings.some((f) => f.id === 'trust.testimonials')).toBe(true);
    expect(result.findings.some((f) => f.id === 'trust.googleReviews')).toBe(true);
  });
});

// ── JS-heavy shell handling ────────────────────────────────────────────

describe('looksLikeJsAppShell / renderingRequired handling', () => {
  it('flags a React/Vite-style empty root shell', () => {
    expect(looksLikeJsAppShell({ wordCount: 0, headings: [], forms: 0, buttonTexts: [], htmlLength: 3000, bodyTextLength: 0 })).toBe(true);
  });
  it('does not flag a normal content-rich page', () => {
    expect(looksLikeJsAppShell({ wordCount: 300, headings: [{ level: 1, text: 'x' }], forms: 1, buttonTexts: [], htmlLength: 5000, bodyTextLength: 1500 })).toBe(false);
  });
  it('does not flag a small legitimate page just because it is short', () => {
    expect(looksLikeJsAppShell({ wordCount: 20, headings: [{ level: 1, text: 'x' }], forms: 1, buttonTexts: [], htmlLength: 800, bodyTextLength: 120 })).toBe(false);
  });

  it('a genuine JS shell produces renderingRequired: true and a status of "partial", never a fabricated "no services" claim', async () => {
    mockPublicDns();
    mockHtml('<html><head><script src="/app.js"></script></head><body><div id="root"></div></body></html>');
    const result = await analyzeWebsiteForOutreach('https://spa-shell.example.com/', { skipCache: true });
    expect(result.renderingRequired).toBe(true);
    expect(result.status).toBe('partial');
    const renderingFinding = result.findings.find((f) => f.id === 'technical.renderingRequired');
    expect(renderingFinding).toBeTruthy();
    expect(renderingFinding.outreachText.toLowerCase()).toContain('javascript');
    // must not fabricate a confident "no contact form"/"no CTA" style claim for a shell it couldn't really see
    expect(result.findings.some((f) => f.id === 'conversion.contactForm')).toBe(false);
    expect(result.findings.some((f) => f.id === 'conversion.primaryCta')).toBe(false);
  });
});

// ── Never invents performance data ────────────────────────────────────

describe('performanceSignals — never fabricates a measurement', () => {
  it('reports measured: false and no timing/score fields', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const result = await analyzeWebsiteForOutreach('https://perf-test.example.com/', { skipCache: true });
    expect(result.performanceSignals.measured).toBe(false);
    expect(result.performanceSignals).not.toHaveProperty('lcp');
    expect(result.performanceSignals).not.toHaveProperty('score');
    expect(result.performanceSignals).not.toHaveProperty('loadTime');
  });

  it('no finding ever claims a load-time/LCP/PageSpeed-style number', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const result = await analyzeWebsiteForOutreach('https://perf-test-2.example.com/', { skipCache: true });
    for (const f of result.findings) {
      expect(f.outreachText).not.toMatch(/\d+(\.\d+)?\s*seconds?/i);
      expect(f.outreachText).not.toMatch(/\bLCP\b/i);
      expect(f.outreachText).not.toMatch(/\bPageSpeed\b/i);
    }
  });
});

// ── Confidence / evidence contract ────────────────────────────────────

describe('finding contract — confidence and evidence', () => {
  it('every finding has a confidence level and non-empty evidence object', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml().replace('<form><input name="email"/></form>', ''));
    const result = await analyzeWebsiteForOutreach('https://evidence-test.example.com/', { skipCache: true });
    for (const f of result.findings) {
      expect(['high', 'medium', 'low']).toContain(f.confidence);
      expect(typeof f.evidence).toBe('object');
      expect(Object.keys(f.evidence).length).toBeGreaterThan(0);
    }
  });

  it('the outreach writer receives outreachText, never a raw technical id, via the adapter + findingSelector', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml().replace('<form><input name="email"/></form>', ''));
    const analysis = await analyzeWebsiteForOutreach('https://adapter-test.example.com/', { skipCache: true });
    const audit = toGrowthAuditShapedResult(analysis);
    const { findings } = selectTopFindings(audit, {});
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.outreachText).toBeTruthy();
      expect(f.outreachText).not.toMatch(/^[a-z]+\.[a-zA-Z]+$/); // never just the raw id
    }
  });
});

// ── toGrowthAuditShapedResult adapter ─────────────────────────────────

describe('toGrowthAuditShapedResult', () => {
  it('never sets an overallScore — this analyzer has no comparable scoring concept', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml());
    const analysis = await analyzeWebsiteForOutreach('https://score-test.example.com/', { skipCache: true });
    const audit = toGrowthAuditShapedResult(analysis);
    expect(audit.overallScore).toBeNull();
  });

  it('marks meta.partial true for a JS-shell/error result', async () => {
    mockPublicDns();
    mockHtml('<html><body><div id="root"></div></body></html>');
    const analysis = await analyzeWebsiteForOutreach('https://partial-test.example.com/', { skipCache: true });
    const audit = toGrowthAuditShapedResult(analysis);
    expect(audit.meta.partial).toBe(true);
  });

  it('recommendations are sorted by priority, highest first', async () => {
    mockPublicDns();
    mockHtml(fullPageHtml().replace('<form><input name="email"/></form>', ''));
    const analysis = await analyzeWebsiteForOutreach('https://priority-test.example.com/', { skipCache: true });
    const audit = toGrowthAuditShapedResult(analysis);
    const priorities = audit.recommendations.map((r) => r.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});

// ── Business-type prioritisation (end-to-end through the existing selector) ──

describe('business-type prioritisation — full pipeline', () => {
  it('a barber missing booking/contact signals surfaces a conversion finding as the top pick', async () => {
    mockPublicDns();
    const html = fullPageHtml().replace('<form><input name="email"/></form>', '').replace('<a href="/contact">Get a quote</a>', '');
    mockHtml(html);
    const analysis = await analyzeWebsiteForOutreach('https://barber-test.example.com/', { skipCache: true });
    const audit = toGrowthAuditShapedResult(analysis);
    const { findings } = selectTopFindings(audit, { businessType: 'barber' });
    expect(findings.length).toBeGreaterThan(0);
    expect(['conversion', 'mobile', 'localSeo']).toContain(findings[0].category);
  });
});

// ── Full pipeline through the EXISTING writer + quality gate (unmodified
// logic, proving the lightweight analyzer's output is compatible end-to-end) ──

describe('full pipeline — analyzer -> findingSelector -> outreachWriter prompt -> outreachQuality', () => {
  it('the outreach prompt built from lightweight-analyzer findings never claims an automated tool generated those findings', async () => {
    mockPublicDns();
    const html = fullPageHtml().replace('<form><input name="email"/></form>', '');
    mockHtml(html);
    const analysis = await analyzeWebsiteForOutreach('https://prompt-test.example.com/', { skipCache: true });
    const audit = toGrowthAuditShapedResult(analysis);
    const { findings } = selectTopFindings(audit, {});
    const prompt = buildInitialPrompt({ businessName: 'Riverside Plumbing', channel: 'email', myName: 'Dean', findings });
    // The prompt must explicitly instruct the model never to claim an
    // automated tool generated these findings (checked as instructions the
    // model is given, not as a claim that would appear if the model ignored
    // them — verifying actual model output requires a live AI call, out of
    // scope for a deterministic unit test).
    expect(prompt).toContain('NOT writing this message as a report generated by any tool');
    expect(prompt).toContain('Never say "I ran your site through it/a tool/a scanner"');
  });

  it('a plausible generated message body (evidence-based, no banned phrases) passes the existing quality gate using lightweight-analyzer findings', async () => {
    mockPublicDns();
    const html = fullPageHtml().replace('<form><input name="email"/></form>', '');
    mockHtml(html);
    const analysis = await analyzeWebsiteForOutreach('https://quality-gate-test.example.com/', { skipCache: true });
    const audit = toGrowthAuditShapedResult(analysis);
    const { findings } = selectTopFindings(audit, {});
    expect(findings.length).toBeGreaterThan(0);
    const finding = findings[0];
    const body = `Hi Riverside Plumbing team, I'm Dean — a web developer and founder of Bookrightly. I had a look at your site and noticed ${finding.outreachText}. Bookrightly gives small businesses their own professional website and online booking system in one place, so it's easier for customers to find and contact you. You can have a look here: https://bookrightly.co.uk/. Would you be interested?`;
    const result = assessOutreachQuality(body, { businessName: 'Riverside Plumbing', channel: 'email', findingsUsed: findings });
    expect(result.passed).toBe(true);
  });
});

// ── Removed legacy files are safe to remove ─────────────────────────────

describe('legacy outreach files removal safety', () => {
  it('outreach_email_prompt.md and generate_email.py no longer exist at the project root', () => {
    const projectRoot = path.join(__dirname, '..');
    expect(fs.existsSync(path.join(projectRoot, 'outreach_email_prompt.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'generate_email.py'))).toBe(false);
  });

  it('nothing in the active source tree references the removed files', () => {
    const filesToScan = [
      'index.js', 'findingSelector.js', 'growthAuditOutreachWriter.js', 'outreachQuality.js',
      'outreachWebsiteAudit.js', 'crmGmailService.js',
    ];
    for (const file of filesToScan) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(source).not.toMatch(/generate_email\.py|outreach_email_prompt\.md/);
    }
    const crmSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'crm', 'CrmGrowthAuditOutreach.jsx'), 'utf8');
    expect(crmSource).not.toMatch(/generate_email\.py|outreach_email_prompt\.md/);
  });
});
