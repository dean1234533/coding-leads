import { describe, it, expect } from 'vitest';
import { selectTopFindings } from './findingSelector.js';
import { assessOutreachQuality } from './outreachQuality.js';
import { buildInitialPrompt, buildFollowUpPrompt, buildSoftPrompt } from './growthAuditOutreachWriter.js';

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

// ── 1. Poor website ─────────────────────────────────────────────────────
describe('selectTopFindings — poor website (many real, high-severity issues)', () => {
  it('selects the top 3, one per category, highest priority first', () => {
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
});

// ── 2. Average website ──────────────────────────────────────────────────
describe('selectTopFindings — average website (mixed severities)', () => {
  it('still finds enough meaningful findings when at least one is medium+', () => {
    const audit = makeAudit([
      makeRec({ id: 'trust.reviews', category: 'trust', severity: 'low', priority: 20 }),
      makeRec({ id: 'mobile.responsive', category: 'mobile', severity: 'medium', priority: 55 }),
    ]);
    const { hasEnough } = selectTopFindings(audit);
    expect(hasEnough).toBe(true);
  });
});

// ── 3. Excellent website ────────────────────────────────────────────────
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

// ── 4. JavaScript-heavy website ─────────────────────────────────────────
describe('selectTopFindings — JS-heavy website (detected/inferred findings)', () => {
  it('preserves the real detectionMethod/measurementType for hedged language downstream', () => {
    const audit = makeAudit([
      makeRec({ id: 'conversion.primaryCta', category: 'conversion', detectionMethod: 'detected', severity: 'high', priority: 80 }),
      makeRec({ id: 'mobile.responsive', category: 'mobile', detectionMethod: 'inferred', severity: 'medium', priority: 50 }),
    ]);
    const { findings } = selectTopFindings(audit);
    expect(findings.find((f) => f.id === 'conversion.primaryCta').measurementType).toBe('detected');
    expect(findings.find((f) => f.id === 'mobile.responsive').measurementType).toBe('inferred');
  });
});

// ── 5 & 6. NOT_VERIFIED / NOT_APPLICABLE findings ───────────────────────
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

// ── 7. Local business with strong local SEO ─────────────────────────────
describe('selectTopFindings — strong local SEO, business type would normally favour localSeo', () => {
  it('does not force a localSeo finding into the top picks when the real top issues are elsewhere', () => {
    const audit = makeAudit([
      makeRec({ id: 'performance.lcp', category: 'performance', severity: 'critical', priority: 100 }),
      makeRec({ id: 'accessibility.formLabels', category: 'accessibility', severity: 'high', priority: 85 }),
      // Only a trivial localSeo nit exists — should not be artificially promoted above real issues.
      makeRec({ id: 'local.reviews', category: 'localSeo', severity: 'low', priority: 15 }),
    ]);
    const { findings } = selectTopFindings(audit, { businessType: 'painter_decorator', maxFindings: 2 });
    expect(findings.map((f) => f.category)).toEqual(['performance', 'accessibility']);
  });

  it('DOES prefer a business-type-relevant finding when priorities are close', () => {
    const audit = makeAudit([
      makeRec({ id: 'accessibility.contrast', category: 'accessibility', severity: 'medium', priority: 62 }),
      makeRec({ id: 'local.locationPages', category: 'localSeo', severity: 'medium', priority: 60 }), // within 5 of the above
    ]);
    const { findings } = selectTopFindings(audit, { businessType: 'painter_decorator', maxFindings: 1 });
    expect(findings[0].category).toBe('localSeo');
  });
});

// ── 8. Business with clear conversion problems ──────────────────────────
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

// ── Quality gate ─────────────────────────────────────────────────────────
describe('assessOutreachQuality', () => {
  const finding = makeRec({ evidence: 'Homepage LCP measured at 3.9 seconds' });

  it('passes a short, personalised, evidence-based, low-pressure message', () => {
    const body = "Hi, I had a quick look at Bright Smiles Dental and ran it through my Growth Audit. Your homepage is taking a while to load — measured at 3.9 seconds — which can cause visitors to leave before it's even loaded. I've got the full audit with recommendations if you'd like me to send it over. No pressure either way.";
    const result = assessOutreachQuality(body, { businessName: 'Bright Smiles Dental', channel: 'email', findingsUsed: [finding] });
    expect(result.passed).toBe(true);
    expect(result.checks.personalisation).toBe(true);
    expect(result.checks.evidence).toBe(true);
  });

  it('fails on a banned generic phrase', () => {
    const body = 'Hope you\'re well! I came across your amazing business and wanted to reach out.';
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.naturalTone).toBe(false);
  });

  it('fails on an aggressive first CTA', () => {
    const body = 'Hi Test Ltd, I found some issues on your site. Book a call with me today to discuss buying a new website.';
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.ctaQuality).toBe(false);
  });

  it('fails on overclaiming/unsupported-certainty language', () => {
    const body = 'Hi Test Ltd, I guarantee fixing this will 100% certain double your enquiries. I can send the audit over.';
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.noUnsupportedClaims).toBe(false);
  });

  it('flags a message that is too long for a WhatsApp/Instagram-length channel', () => {
    const longBody = 'Hi Test Ltd, '.repeat(30) + 'I can send the audit over.';
    const result = assessOutreachQuality(longBody, { businessName: 'Test Ltd', channel: 'whatsapp', findingsUsed: [] });
    expect(result.checks.brevity).toBe(false);
  });

  it('does not require evidence/personalisation for a pass, but does lower the score', () => {
    const body = 'Hi, hope things are going well at the shop — happy to send the audit if useful.';
    const result = assessOutreachQuality(body, { businessName: 'Corner Shop', channel: 'email', findingsUsed: [finding] });
    expect(result.checks.personalisation).toBe(false);
    expect(result.score).toBeLessThan(100);
  });
});

// ── Prompt construction: confidence hedging + channel/mode variation ────
describe('growthAuditOutreachWriter — prompt construction', () => {
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

  it('never lets a finding be presented without its evidence text somewhere in the prompt', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'Missing H1', evidence: '0 H1 tags found on homepage', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'Test Ltd', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('0 H1 tags found on homepage');
  });

  it('adapts channel guidance for WhatsApp vs email vs LinkedIn', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const emailPrompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    const waPrompt = buildInitialPrompt({ businessName: 'T', channel: 'whatsapp', myName: 'Dean', findings });
    const liPrompt = buildInitialPrompt({ businessName: 'T', channel: 'linkedin', myName: 'Dean', findings });
    expect(emailPrompt).toContain('This is an EMAIL');
    expect(waPrompt).toContain('This is a WHATSAPP message');
    expect(liPrompt).toContain('This is a LINKEDIN message');
  });

  it('bans the exact generic phrases named in the spec', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain("Hope you're well");
    expect(prompt).toContain('I came across your amazing business');
    expect(prompt).toContain('I help businesses like yours');
  });

  it('the CTA instruction is "send the full audit", explicitly not book a call / buy / pay', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('I can send you the full audit');
    expect(prompt).toContain('NOT "book a call"');
  });

  it('follow-up 2 prompt is explicitly the final, lowest-pressure message', () => {
    const prompt = buildFollowUpPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', stage: 2 });
    expect(prompt.toLowerCase()).toContain('final follow-up');
    expect(prompt.toLowerCase()).toContain('no worries');
  });

  it('soft-mode prompt explicitly forbids manufacturing problems for a healthy site', () => {
    const prompt = buildSoftPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings: [] });
    expect(prompt.toLowerCase()).toContain('do not manufacture problems');
  });

  it('business-type focus hint only appears when the industry is recognised, and never overrides real findings', () => {
    const findings = [{ id: 'a', category: 'performance', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const withIndustry = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'personal_trainer' });
    const withoutIndustry = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(withIndustry).toContain('bookings, enquiries, trust signals and local visibility');
    expect(withoutIndustry).not.toContain('bookings, enquiries, trust signals and local visibility');
  });
});
