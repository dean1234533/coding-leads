import { describe, it, expect } from 'vitest';
import { deriveIssues, pickScreenshot, REVIEW_WIDGET_PATTERNS, CONTACT_LINK_RE } from './websiteAudit.js';

describe('deriveIssues — cumulative layout shift threshold', () => {
  // Regression: this used to only fire above 0.25 (Google's "poor" tier),
  // which missed real, visibly-noticeable jumping sitting in the "needs
  // improvement" band (0.1-0.25) — confirmed on a real lead at 0.108 and
  // 0.126, both clearly perceptible on scroll but silently let through.
  it('flags "Page Jumps While Loading" just above the "good" threshold (0.1)', () => {
    const issues = deriveIssues({}, { 'cumulative-layout-shift': { numericValue: 0.108 } }, 'https://example.com');
    expect(issues).toContain('Page Jumps While Loading');
  });

  it('does not flag layout shift at or below the "good" threshold', () => {
    const issues = deriveIssues({}, { 'cumulative-layout-shift': { numericValue: 0.1 } }, 'https://example.com');
    expect(issues).not.toContain('Page Jumps While Loading');
  });

  it('flags it well above the old "poor" threshold too', () => {
    const issues = deriveIssues({}, { 'cumulative-layout-shift': { numericValue: 0.4 } }, 'https://example.com');
    expect(issues).toContain('Page Jumps While Loading');
  });
});

describe('deriveIssues — mobile-friendliness', () => {
  // Regression: this used to check audits['meta-viewport'], which Lighthouse
  // repurposed into an accessibility check for disabled pinch-zoom
  // (unrelated to whether the page is actually mobile-friendly) — a real
  // lead with a deliberately zoom-disabled but fully responsive booking
  // widget was wrongly flagged "Not Mobile Friendly" as a result.
  it('does not flag "Not Mobile Friendly" purely because pinch-zoom is disabled', () => {
    const audits = {
      'meta-viewport': { score: 0 }, // disabled zoom — should NOT be read as "not mobile friendly"
      'viewport-insight': { score: 1 },
    };
    const issues = deriveIssues({}, audits, 'https://example.com');
    expect(issues).not.toContain('Not Mobile Friendly');
  });

  it('flags "Not Mobile Friendly" when viewport-insight is not a clean pass', () => {
    const issues = deriveIssues({}, { 'viewport-insight': { score: 0.5 } }, 'https://example.com');
    expect(issues).toContain('Not Mobile Friendly');
  });
});

describe('deriveIssues — SSL', () => {
  it('flags missing SSL when the final URL is not https', () => {
    const issues = deriveIssues({}, {}, 'http://example.com');
    expect(issues).toContain('Missing SSL');
  });

  it('does not flag SSL when the final URL is https, even if the original request was http', () => {
    const issues = deriveIssues({}, {}, 'https://example.com');
    expect(issues).not.toContain('Missing SSL');
  });
});

describe('pickScreenshot', () => {
  it('prefers the full-page screenshot when present and under the size cap', () => {
    const lighthouseResult = {
      fullPageScreenshot: { screenshot: { data: 'FULL_PAGE_DATA' } },
      audits: { 'final-screenshot': { details: { data: 'VIEWPORT_DATA' } } },
    };
    expect(pickScreenshot(lighthouseResult)).toBe('FULL_PAGE_DATA');
  });

  it('falls back to the viewport screenshot when there is no full-page one', () => {
    const lighthouseResult = { audits: { 'final-screenshot': { details: { data: 'VIEWPORT_DATA' } } } };
    expect(pickScreenshot(lighthouseResult)).toBe('VIEWPORT_DATA');
  });

  it('falls back to the viewport screenshot when the full-page one is too large', () => {
    const huge = 'x'.repeat(7_000_000);
    const lighthouseResult = {
      fullPageScreenshot: { screenshot: { data: huge } },
      audits: { 'final-screenshot': { details: { data: 'VIEWPORT_DATA' } } },
    };
    expect(pickScreenshot(lighthouseResult)).toBe('VIEWPORT_DATA');
  });

  it('returns null when there is no screenshot at all', () => {
    expect(pickScreenshot({})).toBeNull();
  });
});

describe('REVIEW_WIDGET_PATTERNS', () => {
  function matchesAny(html) {
    return REVIEW_WIDGET_PATTERNS.some((re) => re.test(html));
  }

  // Both of these are real HTML fragments pulled from actual leads during
  // this session that the AI's screenshot judgment wrongly read as "No
  // Testimonials" because the widget hadn't finished rendering when
  // PageSpeed's screenshot was captured.
  it('matches a Trustindex Google-reviews widget', () => {
    expect(matchesAny('<div id="trustindex-google-widget-html">Based on <strong>23 reviews</strong></div>')).toBe(true);
  });

  it('matches a native Elementor testimonial carousel', () => {
    expect(matchesAny('<div class="elementor-widget-testimonial-carousel"><h3>Our Testimonial</h3></div>')).toBe(true);
  });

  it('does not match a page with no review-related content', () => {
    expect(matchesAny('<div class="hero"><h1>Welcome to our barbershop</h1></div>')).toBe(false);
  });
});

describe('CONTACT_LINK_RE', () => {
  // Regression: the original version of this regex used a
  // (?:["'?#]|$) alternation *inside* the capture group to try to anchor
  // the end of the href value — that consumed the closing quote character
  // itself, so the regex engine kept scanning for the *next* quote in the
  // document and silently captured a chunk of the following HTML attribute
  // along with it (confirmed live: capturing over 30 characters past the
  // real href into a `data-animation-role=` attribute, which then 404'd
  // when fetched as a URL). Simplified to not consume the terminator.
  it('captures only the href value, not into the next attribute', () => {
    const html = '<a href="/contact"        data-animation-role="fade-up">Contact</a>';
    const match = html.match(CONTACT_LINK_RE);
    expect(match[1]).toBe('/contact');
  });

  it('matches /contact-us too', () => {
    const html = '<a href="https://example.com/contact-us">Get in touch</a>';
    expect(html.match(CONTACT_LINK_RE)[1]).toBe('https://example.com/contact-us');
  });

  it('does not match an unrelated link', () => {
    const html = '<a href="/about">About</a>';
    expect(html.match(CONTACT_LINK_RE)).toBeNull();
  });
});
