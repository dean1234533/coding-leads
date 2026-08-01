import { describe, it, expect } from 'vitest';
import { selectTopFindings } from './findingSelector.js';
import { assessOutreachQuality } from './outreachQuality.js';
import { buildInitialPrompt, buildFollowUpPrompt, buildSoftPrompt, CTA_VARIATIONS, SERVICE_MENTION_EXAMPLES } from './growthAuditOutreachWriter.js';
import { AUDIT_TOOL_URL, PORTFOLIO_URL, buildAuditToolUrl } from './growthAuditConfig.js';

function makeRec(overrides = {}) {
  return {
    id: 'seo.missingH1',
    category: 'seo',
    title: 'Exactly one H1 present',
    description: 'The homepage is missing a clear main heading.',
    severity: 'high',
    impact: 'high',
    difficulty: 'easy',
    estimatedTime: '15 minutes',
    priority: 90,
    aiGenerated: false,
    evidence: '0 H1 tags found',
    affectedUrl: 'https://example.com/',
    detectionMethod: 'measured',
    ...overrides,
  };
}

function makeAudit(recommendations, extraChecks = []) {
  return {
    url: 'https://example.com/',
    scannedAt: '2026-08-01T00:00:00Z',
    overallScore: 70,
    categories: [
      { id: 'seo', label: 'SEO', score: 70, checks: extraChecks },
    ],
    recommendations,
    growthEstimate: { additionalEnquiriesPerMonth: [0, 1], visibilityImprovementPct: 0, conversionImprovementPct: 0, speedImprovementPct: 0, accessibilityImprovementPct: 0 },
    meta: { pageTitle: 't', partial: false, warnings: [] },
  };
}

// ── 1. Tattoo studio ─────────────────────────────────────────────────────
describe('selectTopFindings — tattoo studio (booking CTA is the real issue)', () => {
  it('surfaces the missing booking CTA as the top pick', () => {
    const audit = makeAudit([
      makeRec({ id: 'conversion.primaryCta', category: 'conversion', title: 'No booking CTA', severity: 'high', priority: 85 }),
      makeRec({ id: 'seo.titleLength', category: 'seo', severity: 'low', priority: 20 }),
    ]);
    const { findings } = selectTopFindings(audit, { businessType: 'tattoo' });
    expect(findings[0].category).toBe('conversion');
  });

  it('the impact-journey hint for tattoo talks about viewing work vs enquiring', () => {
    const findings = [{ id: 'a', category: 'conversion', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'tattoo' });
    expect(prompt).toContain('go from viewing your work to enquiring about an appointment');
  });
});

// ── 2. Barber ────────────────────────────────────────────────────────────
describe('selectTopFindings — barber (mobile booking experience)', () => {
  it('prefers mobile/conversion findings relevant to a barber when priorities are close', () => {
    const audit = makeAudit([
      makeRec({ id: 'accessibility.contrast', category: 'accessibility', severity: 'medium', priority: 62 }),
      makeRec({ id: 'mobile.touchTargets', category: 'mobile', severity: 'medium', priority: 60 }),
    ]);
    const { findings } = selectTopFindings(audit, { businessType: 'barber', maxFindings: 1 });
    expect(findings[0].category).toBe('mobile');
  });

  it('the impact-journey hint for barber talks about Google to booking', () => {
    const findings = [{ id: 'a', category: 'mobile', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'barber' });
    expect(prompt).toContain('go from finding you on Google to booking an appointment');
  });
});

// ── 3. Personal trainer ─────────────────────────────────────────────────
describe('selectTopFindings — personal trainer (booking journey)', () => {
  it('the impact-journey hint for personal trainer talks about finding the site vs booking a session', () => {
    const findings = [{ id: 'a', category: 'conversion', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'personal_trainer' });
    expect(prompt).toContain('go from finding your site to booking a session');
  });
});

// ── 4. Painter/decorator ────────────────────────────────────────────────
describe('selectTopFindings — painter/decorator (local search + quote enquiries)', () => {
  it('does not force a localSeo finding into the top picks when the real top issues are elsewhere', () => {
    const audit = makeAudit([
      makeRec({ id: 'performance.lcp', category: 'performance', severity: 'critical', priority: 100 }),
      makeRec({ id: 'accessibility.formLabels', category: 'accessibility', severity: 'high', priority: 85 }),
      makeRec({ id: 'local.reviews', category: 'localSeo', severity: 'low', priority: 15 }),
    ]);
    const { findings } = selectTopFindings(audit, { businessType: 'painter_decorator', maxFindings: 2 });
    expect(findings.map((f) => f.category)).toEqual(['performance', 'accessibility']);
  });

  it('DOES prefer a business-type-relevant finding when priorities are close', () => {
    const audit = makeAudit([
      makeRec({ id: 'accessibility.contrast', category: 'accessibility', severity: 'medium', priority: 62 }),
      makeRec({ id: 'local.locationPages', category: 'localSeo', severity: 'medium', priority: 60 }),
    ]);
    const { findings } = selectTopFindings(audit, { businessType: 'painter_decorator', maxFindings: 1 });
    expect(findings[0].category).toBe('localSeo');
  });

  it('the impact-journey hint for painter talks about quotes', () => {
    const findings = [{ id: 'a', category: 'localSeo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'painter' });
    expect(prompt).toContain('looking for a quote to get in touch');
  });
});

// ── 5. Restaurant ────────────────────────────────────────────────────────
describe('selectTopFindings — restaurant', () => {
  it('the impact-journey hint for restaurant talks about booking a table', () => {
    const findings = [{ id: 'a', category: 'mobile', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'restaurant' });
    expect(prompt).toContain('go from finding you online to booking a table');
  });
});

// ── 6. Very poor website / tradesperson ─────────────────────────────────
describe('selectTopFindings — poor website (many real, high-severity issues)', () => {
  it('selects the top 3, one per category, highest priority first, preferring measurable categories on close ties', () => {
    const audit = makeAudit([
      makeRec({ id: 'seo.missingH1', category: 'seo', priority: 90, severity: 'high' }),
      makeRec({ id: 'performance.lcp', category: 'performance', priority: 95, severity: 'critical' }),
      makeRec({ id: 'mobile.touchTargets', category: 'mobile', priority: 60, severity: 'medium' }),
      makeRec({ id: 'seo.metaDescription', category: 'seo', priority: 40, severity: 'low' }), // same category as seo.missingH1 — should be deduped out
    ]);
    const { findings, hasEnough } = selectTopFindings(audit, { maxFindings: 3 });
    expect(findings).toHaveLength(3);
    expect(findings[0].id).toBe('performance.lcp'); // highest priority first
    expect(findings.map((f) => f.category)).toEqual(['performance', 'seo', 'mobile']);
    expect(hasEnough).toBe(true);
  });

  it('prefers measurable categories (performance/conversion/mobile) over subjective ones (trust) on a close priority tie, with no business type', () => {
    const audit = makeAudit([
      makeRec({ id: 'trust.testimonials', category: 'trust', severity: 'medium', priority: 60 }),
      makeRec({ id: 'mobile.overflow', category: 'mobile', severity: 'medium', priority: 58 }),
    ]);
    const { findings } = selectTopFindings(audit, { maxFindings: 1 });
    expect(findings[0].category).toBe('mobile');
  });

  it('the impact-journey hint for a tradesperson talks about getting in touch about a job', () => {
    const findings = [{ id: 'a', category: 'conversion', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'trades' });
    expect(prompt).toContain('get in touch about a job');
  });
});

// ── 7. Strong website ───────────────────────────────────────────────────
describe('selectTopFindings — excellent website (no real findings)', () => {
  it('returns hasEnough:false and an empty findings list, never manufactures a weakness', () => {
    const audit = makeAudit([]);
    const { findings, hasEnough } = selectTopFindings(audit);
    expect(findings).toEqual([]);
    expect(hasEnough).toBe(false);
  });

  it('a single low-severity nit alone is not "enough" for hard-hitting outreach', () => {
    const audit = makeAudit([makeRec({ severity: 'low', priority: 10 })]);
    const { hasEnough } = selectTopFindings(audit);
    expect(hasEnough).toBe(false);
  });
});

// ── 8. NOT_VERIFIED / NOT_APPLICABLE findings ───────────────────────────
describe('selectTopFindings — NOT_VERIFIED / NOT_APPLICABLE isolation', () => {
  it('only ever reads from audit.recommendations, never audit.categories[].checks — so a not_verified/not_applicable check sitting in categories cannot leak into outreach even if present', () => {
    const audit = makeAudit(
      [makeRec({ id: 'seo.missingH1', category: 'seo', priority: 90 })],
      [
        { id: 'conv.stickyCta', category: 'seo', label: 'x', passed: true, detail: 'x', severity: 'medium', weight: 0, measurementType: 'not_available', status: 'not_verified' },
        { id: 'seo.breadcrumbSchema', category: 'seo', label: 'x', passed: true, detail: 'x', severity: 'low', weight: 0, measurementType: 'detected', status: 'not_applicable' },
      ],
    );
    const { findings } = selectTopFindings(audit);
    expect(findings.map((f) => f.id)).toEqual(['seo.missingH1']);
    expect(findings.some((f) => f.id === 'conv.stickyCta' || f.id === 'seo.breadcrumbSchema')).toBe(false);
  });
});

describe('selectTopFindings — clear conversion problem', () => {
  it('surfaces the conversion finding as the top pick when it genuinely is the highest priority', () => {
    const audit = makeAudit([
      makeRec({ id: 'conversion.primaryCta', category: 'conversion', severity: 'critical', priority: 100 }),
      makeRec({ id: 'seo.titleLength', category: 'seo', severity: 'low', priority: 20 }),
    ]);
    const { findings } = selectTopFindings(audit, { businessType: 'barber' });
    expect(findings[0].category).toBe('conversion');
  });
});

// ── Audit tool URL / portfolio config ───────────────────────────────────
describe('growthAuditConfig', () => {
  it('AUDIT_TOOL_URL points at the real Growth Audit homepage, not the API endpoint', () => {
    expect(AUDIT_TOOL_URL).toBe('https://app.dean-da-dev.co.uk/');
  });

  it('buildAuditToolUrl returns the bare URL, no tracking query string — a clean link reads like a real person sent it', () => {
    expect(buildAuditToolUrl('whatsapp')).toBe('https://app.dean-da-dev.co.uk/');
    expect(buildAuditToolUrl(undefined)).toBe('https://app.dean-da-dev.co.uk/');
  });

  it('PORTFOLIO_URL is a single configured value', () => {
    expect(PORTFOLIO_URL).toBe('https://www.dean-da-dev.co.uk/portfolio');
  });
});

// ── Quality gate ─────────────────────────────────────────────────────────
describe('assessOutreachQuality', () => {
  const finding = makeRec({ evidence: 'Homepage LCP measured at 3.9 seconds' });
  const link = buildAuditToolUrl('email');

  it('passes a short, personal, evidence-based message that introduces Dean and points to the audit tool', () => {
    const body = `Hi Bright Smiles Dental team, I'm Dean, a web developer and designer, and I came across your website. I noticed your homepage is taking a while to load — measured at 3.9 seconds — which can be frustrating for visitors on slower connections. I built a free website audit tool that checks for things like this. Run your free audit here: ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Bright Smiles Dental', channel: 'email', findingsUsed: [finding] });
    expect(result.passed).toBe(true);
    expect(result.checks.personalisation).toBe(true);
    expect(result.checks.evidence).toBe(true);
    expect(result.checks.includesAuditUrl).toBe(true);
    expect(result.checks.notAuditDump).toBe(true);
  });

  it('fails on a banned generic phrase', () => {
    const body = `Hope you're well! I came across your amazing business and wanted to reach out. ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.naturalTone).toBe(false);
  });

  it('fails on the old automated-sounding "I was looking at local businesses in the area" opener', () => {
    const body = `I was looking at local businesses in the area and had a look at Test Ltd's website. ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.naturalTone).toBe(false);
  });

  it('fails on the generic "working, fast, mobile-friendly website" sales paragraph', () => {
    const body = `Hi Test Ltd, I'm Dean. A working, fast, mobile-friendly website can make a big difference for you. ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.naturalTone).toBe(false);
  });

  it('fails on the old "send you the audit" pattern — that CTA is now obsolete', () => {
    const body = "Hi Test Ltd, I ran a quick audit on your site. I can send you the audit if you'd like — just let me know.";
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.naturalTone).toBe(false);
  });

  it('fails on generic AI-hype language', () => {
    const body = `Hi Test Ltd, I built a revolutionary AI-powered website audit tool. Try it here: ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.naturalTone).toBe(false);
  });

  it('fails on an immediate hard-sell CTA (build/redesign/quote/book a call)', () => {
    const body = `Hi Test Ltd, I found some issues on your site. Would you like a quote to redesign your site? ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.ctaQuality).toBe(false);
  });

  it('fails when the audit tool link is missing entirely', () => {
    const body = 'Hi Test Ltd, I had a look at your site and noticed a few things worth fixing.';
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.includesAuditUrl).toBe(false);
  });

  it('fails on overclaiming/unsupported-certainty language', () => {
    const body = `Hi Test Ltd, I guarantee fixing this will 100% certain double your enquiries. ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.noUnsupportedClaims).toBe(false);
  });

  it('flags a message that is too long for a WhatsApp-length channel (over 150 words)', () => {
    const longBody = 'Hi Test Ltd, '.repeat(60) + `check it out: ${link}`;
    const result = assessOutreachQuality(longBody, { businessName: 'Test Ltd', channel: 'whatsapp', findingsUsed: [] });
    expect(result.checks.brevity).toBe(false);
  });

  it('fails when a numeric audit score is included but was not explicitly opted into', () => {
    const body = `Hi Test Ltd, your website scored 71/100 on our audit. ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [], includeScore: false });
    expect(result.passed).toBe(false);
    expect(result.checks.notAuditDump).toBe(false);
  });

  it('allows a numeric score when includeScore is explicitly true', () => {
    const body = `Hi Test Ltd, I'm Dean. Your site scored 71/100 on the audit tool I built. Run your free audit here: ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [], includeScore: true });
    expect(result.checks.notAuditDump).toBe(true);
  });

  it('fails on a long bullet-point finding/feature dump (reads like an audit report, not a personal note)', () => {
    const body = `Hi Test Ltd,\n\nYour website scored well but here's what we found:\n\n• Confusing layout\n• No testimonials\n• No Google reviews\n• No portfolio\n• Poor CTA\n\n${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.notAuditDump).toBe(false);
  });

  it('does not require evidence/personalisation for a pass, but does lower the score', () => {
    const body = `Hi, hope things are going well at the shop — here's a free audit tool if useful: ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Corner Shop', channel: 'email', findingsUsed: [finding] });
    expect(result.checks.personalisation).toBe(false);
    expect(result.score).toBeLessThan(100);
  });
});

// ── Prompt construction ──────────────────────────────────────────────────
describe('growthAuditOutreachWriter — prompt construction', () => {
  it('introduces Dean by first name near the beginning, before the "local businesses" framing', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean Burt', findings });
    expect(prompt).toContain('I\'m Dean, a web developer and designer, and I came across your website while looking at local businesses');
    expect(prompt).toContain('Do NOT start with "I was looking at local businesses in the area..." on its own');
  });

  it('caps findings at 3 and instructs the model to normally use only 2', () => {
    const findings = [
      { id: 'a', category: 'performance', title: 'x', evidence: 'x', measurementType: 'measured' },
      { id: 'b', category: 'conversion', title: 'y', evidence: 'y', measurementType: 'measured' },
      { id: 'c', category: 'mobile', title: 'z', evidence: 'z', measurementType: 'measured' },
      { id: 'd', category: 'seo', title: 'w', evidence: 'w', measurementType: 'measured' },
    ];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('USE 2 OF THESE FINDINGS NORMALLY');
    expect(prompt).not.toContain('[seo] w'); // 4th finding dropped, only top 3 passed through
  });

  it('warns against treating subjective findings (no testimonials/portfolio, looks outdated) as automatic problems', () => {
    const findings = [{ id: 'a', category: 'trust', title: 'x', evidence: 'x', measurementType: 'detected' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('a business may have deliberately chosen not to have that thing');
  });

  it('includes explicit hedging instructions matching each finding\'s real confidence level', () => {
    const findings = [
      { id: 'a', category: 'performance', title: 'Slow LCP', evidence: 'Measured LCP 3.9s', measurementType: 'measured' },
      { id: 'b', category: 'trust', title: 'No testimonials', evidence: 'No testimonial markup detected', measurementType: 'detected' },
      { id: 'c', category: 'mobile', title: 'Layout issue', evidence: 'Possible responsive issue', measurementType: 'inferred' },
    ];
    const prompt = buildInitialPrompt({ businessName: 'Test Ltd', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('directly measured, so you can state it plainly as fact');
    expect(prompt).toContain('detected from the page, so state it as an observation');
    expect(prompt).toContain('inferred rather than directly observed — hedge it clearly');
  });

  it('translates technical jargon into plain-English examples', () => {
    const findings = [{ id: 'a', category: 'performance', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'Test Ltd', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('your homepage is taking around 9.5 seconds to load its main content');
    expect(prompt).toContain('some text on the site has low colour contrast');
    expect(prompt).toContain("there's an issue with how the site is configured for mobile devices");
  });

  it('never lets a finding be presented without its evidence text somewhere in the prompt', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'Missing H1', evidence: '0 H1 tags found on homepage', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'Test Ltd', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('0 H1 tags found on homepage');
  });

  it('adapts channel guidance and length ranges for WhatsApp vs email vs LinkedIn', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const emailPrompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    const waPrompt = buildInitialPrompt({ businessName: 'T', channel: 'whatsapp', myName: 'Dean', findings });
    const liPrompt = buildInitialPrompt({ businessName: 'T', channel: 'linkedin', myName: 'Dean', findings });
    expect(emailPrompt).toContain('This is an EMAIL');
    expect(emailPrompt).toContain('150-250 words');
    expect(waPrompt).toContain('This is a WHATSAPP message');
    expect(waPrompt).toContain('80-150 words');
    expect(liPrompt).toContain('This is a LINKEDIN message');
  });

  it('does NOT include a numeric score by default, and only mentions it when includeScore is true', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const withoutScore = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    const withScore = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, includeScore: true, overallScore: 71 });
    expect(withoutScore).toContain('Do NOT mention any numeric audit score in this message');
    expect(withScore).toContain('overall audit score is 71/100');
  });

  it('only includes the portfolio block when explicitly opted in on email', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const withPortfolio = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, includePortfolio: true });
    const withoutPortfolio = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(withPortfolio).toContain(PORTFOLIO_URL);
    expect(withoutPortfolio).not.toContain(PORTFOLIO_URL);
  });

  it('uses a professional email signature with Dean\'s full identity', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean Burt', findings });
    expect(prompt).toContain('Dean Burt\nWeb Developer & Designer\ndean-da-dev.co.uk\ndean@dean-da-dev.co.uk');
  });

  it('uses just a first-name sign-off for non-email channels', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'whatsapp', myName: 'Dean Burt', findings });
    expect(prompt).toContain('just "Dean" on its own line');
  });

  it('bans the old automated opener and the generic sales-brochure paragraph', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('Do not open with "I was looking at local businesses in the area..."');
    expect(prompt).toContain('Do not write a generic sales paragraph');
    expect(prompt).toContain('Do not produce a bullet-point feature list');
  });

  it('bans the old "send you the audit" CTA and immediate web-dev hard-sell, in favour of the audit tool link', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('Do not say "I can send you the audit"');
    expect(prompt).toContain('Do not ask "do you want me to build you a website"');
  });

  it('the CTA points at the exact audit tool URL with a "run it yourself" framing, with real variation examples', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    const link = buildAuditToolUrl('email');
    expect(prompt).toContain(link);
    expect(prompt).toContain('Run your free audit here');
    for (const cta of CTA_VARIATIONS) {
      expect(prompt).toContain(cta.replace('{link}', link));
    }
  });

  it('includes a soft, non-hard-sell service mention after the CTA', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    for (const example of SERVICE_MENTION_EXAMPLES) {
      expect(prompt).toContain(example);
    }
  });

  it('bans AI-hype language', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt.toLowerCase()).toContain('no "ai-powered"');
  });

  it('follow-up 1 points back at the audit tool link with the new low-pressure wording, never "sending the audit"', () => {
    const prompt1 = buildFollowUpPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', stage: 1 });
    const link = buildAuditToolUrl('email');
    expect(prompt1).toContain(link);
    expect(prompt1).toContain('just following up on my message about your website');
    expect(prompt1).toContain('No pressure at all');
  });

  it('follow-up 2 is explicitly the final, lowest-pressure message', () => {
    const prompt = buildFollowUpPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', stage: 2 });
    expect(prompt.toLowerCase()).toContain('final');
    expect(prompt).toContain("It's completely free to run your website through the audit");
  });

  it('soft-mode prompt explicitly forbids manufacturing problems for a healthy site, still introduces Dean, and still includes the tool link', () => {
    const prompt = buildSoftPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings: [] });
    expect(prompt.toLowerCase()).toContain('do not manufacture problems');
    expect(prompt).toContain('Introduce yourself as Dean, a web developer and designer');
    expect(prompt).toContain(buildAuditToolUrl('email'));
  });

  it('business-type impact hint only appears when the industry is recognised, and never overrides real findings', () => {
    const findings = [{ id: 'a', category: 'performance', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const withIndustry = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'personal_trainer' });
    const withoutIndustry = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(withIndustry).toContain('go from finding your site to booking a session');
    expect(withoutIndustry).not.toContain('go from finding your site to booking a session');
  });
});
