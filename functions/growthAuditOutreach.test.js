import { describe, it, expect } from 'vitest';
import { selectTopFindings } from './findingSelector.js';
import { assessOutreachQuality, CHANNEL_WORD_LIMITS } from './outreachQuality.js';
import { buildInitialPrompt, buildFollowUpPrompt, buildSoftPrompt, CTA_VARIATIONS, NO_WEBSITE_FINDING_ID, hasNoRealWebsite } from './growthAuditOutreachWriter.js';
import { PRODUCT_URL } from './growthAuditConfig.js';

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

// ── Product URL config ───────────────────────────────────────────────────
describe('growthAuditConfig', () => {
  it('PRODUCT_URL points at the real Bookrightly homepage', () => {
    expect(PRODUCT_URL).toBe('https://bookrightly.co.uk/');
  });
});

// ── Quality gate ─────────────────────────────────────────────────────────
describe('assessOutreachQuality', () => {
  const finding = makeRec({ evidence: 'Homepage LCP measured at 3.9 seconds' });
  const link = PRODUCT_URL;

  it('passes a short, personal, evidence-based message that introduces Dean and Bookrightly', () => {
    const body = `Hi Bright Smiles Dental team, I'm Dean — a web developer and founder of Bookrightly. I noticed your homepage is taking a while to load — measured at 3.9 seconds — which can be frustrating for visitors on slower connections. Bookrightly gives small businesses a fast, professional website with online booking built in. Have a look here: ${link}`;
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

  it('fails on the old "send you the audit" pattern — that CTA is obsolete', () => {
    const body = "Hi Test Ltd, I ran a quick audit on your site. I can send you the audit if you'd like — just let me know.";
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.naturalTone).toBe(false);
  });

  it('fails on generic AI-hype language', () => {
    const body = `Hi Test Ltd, I built a revolutionary AI-powered platform. Try it here: ${link}`;
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

  it('fails when the Bookrightly link is missing entirely', () => {
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

  it('fails on a fabricated claim that Growth Audit generated the findings — the outreach analyzer is a separate, lightweight, non-browser system', () => {
    const body = `Hi Test Ltd, I ran your site through Growth Audit and it flagged some issues. ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.noFabricatedSource).toBe(false);
  });

  it('fails on a fabricated PageSpeed/Lighthouse-style performance claim — this analyzer never measures real performance', () => {
    const body = `Hi Test Ltd, your PageSpeed score is only 42 and your LCP is 9.5 seconds. ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.noFabricatedSource).toBe(false);
  });

  it('passes a message that honestly attributes findings to a personal look, not Growth Audit', () => {
    const body = `Hi Test Ltd, I'm Dean — a web developer and founder of Bookrightly. I had a look at your website and noticed it's taking a while to load — measured at 3.9 seconds. Have a look at Bookrightly here: ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [finding] });
    expect(result.checks.noFabricatedSource).toBe(true);
  });

  it('flags a message that is too long for a WhatsApp-length channel (over 150 words)', () => {
    const longBody = 'Hi Test Ltd, '.repeat(60) + `check it out: ${link}`;
    const result = assessOutreachQuality(longBody, { businessName: 'Test Ltd', channel: 'whatsapp', findingsUsed: [] });
    expect(result.checks.brevity).toBe(false);
  });

  it('fails when a numeric score is included but was not explicitly opted into', () => {
    const body = `Hi Test Ltd, your website scored 71/100 on our review. ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [], includeScore: false });
    expect(result.passed).toBe(false);
    expect(result.checks.notAuditDump).toBe(false);
  });

  it('allows a numeric score when includeScore is explicitly true', () => {
    const body = `Hi Test Ltd, I'm Dean. Your site scored 71/100. Have a look at Bookrightly here: ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [], includeScore: true });
    expect(result.checks.notAuditDump).toBe(true);
  });

  it('fails on a long bullet-point finding/feature dump (reads like an audit report, not a personal note)', () => {
    const body = `Hi Test Ltd,\n\nYour website scored well but here's what we found:\n\n• Confusing layout\n• No testimonials\n• No Google reviews\n• No portfolio\n• Poor CTA\n\n${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Test Ltd', channel: 'email', findingsUsed: [] });
    expect(result.passed).toBe(false);
    expect(result.checks.notAuditDump).toBe(false);
  });

  it('blocks a draft without evidence or personalisation', () => {
    const body = `Hi, hope things are going well at the shop — here's Bookrightly if useful: ${link}`;
    const result = assessOutreachQuality(body, { businessName: 'Corner Shop', channel: 'email', findingsUsed: [finding] });
    expect(result.checks.personalisation).toBe(false);
    expect(result.score).toBeLessThan(100);
    expect(result.passed).toBe(false);
  });
});

// ── Prompt construction ──────────────────────────────────────────────────
describe('growthAuditOutreachWriter — prompt construction', () => {
  it('introduces Dean and Bookrightly by first name near the beginning, before the "local businesses" framing', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean Burt', findings });
    expect(prompt).toContain('I\'m Dean — a web developer and founder of Bookrightly.');
    expect(prompt).toContain('Do NOT start with "I was looking at local businesses in the area..." on its own');
  });

  it('caps available findings at 3 but instructs the model to use one, or two only when justified', () => {
    const findings = [
      { id: 'a', category: 'performance', title: 'x', evidence: 'x', measurementType: 'measured' },
      { id: 'b', category: 'conversion', title: 'y', evidence: 'y', measurementType: 'measured' },
      { id: 'c', category: 'mobile', title: 'z', evidence: 'z', measurementType: 'measured' },
      { id: 'd', category: 'seo', title: 'w', evidence: 'w', measurementType: 'measured' },
    ];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('USE THE SINGLE STRONGEST FINDING NORMALLY');
    expect(prompt).toContain('Never use a third');
    expect(prompt).not.toContain('[seo] w'); // 4th finding dropped, only top 3 passed through
  });

  it('warns against treating subjective findings (no testimonials/portfolio, looks outdated) as automatic problems', () => {
    const findings = [{ id: 'a', category: 'trust', title: 'x', evidence: 'x', measurementType: 'detected' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('Prefer measurable evidence over subjective observations');
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

  it('instructs the model to translate technical jargon into plain English', () => {
    const findings = [{ id: 'a', category: 'performance', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'Test Ltd', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('state one specific finding in plain English');
    expect(prompt).toContain('Never lead with jargon such as LCP, DOM, schema, viewport, or WCAG');
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
    expect(emailPrompt).toContain('130 words is a HARD LIMIT');
    expect(waPrompt).toContain('This is a WHATSAPP message');
    expect(waPrompt).toContain('90 words is a HARD LIMIT');
    expect(liPrompt).toContain('This is a LINKEDIN message');
  });

  // Regression: a soft "aim for 50-90 words" phrasing reads as a target,
  // not a ceiling, and the model routinely overshot it — the WhatsApp
  // "too long" complaint that prompted this. The stated limit is now
  // pulled directly from CHANNEL_WORD_LIMITS (the same numbers
  // assessOutreachQuality actually enforces) so the instruction and the
  // gate can never silently drift apart, for every channel.
  it('every channel\'s stated hard limit matches the actual enforced CHANNEL_WORD_LIMITS value', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    for (const channel of ['email', 'whatsapp', 'instagram', 'facebook', 'linkedin']) {
      const prompt = buildInitialPrompt({ businessName: 'T', channel, myName: 'Dean', findings });
      expect(prompt).toContain(`${CHANNEL_WORD_LIMITS[channel]} words is a HARD LIMIT`);
    }
  });

  it('gives the email prompt real high-converting subject-line guidance, not just "no fluff"', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain('SUBJECT LINE');
    expect(prompt).toContain('30-50 characters');
    expect(prompt).toContain('No spam-trigger words');
  });

  it('does NOT include a numeric score by default, and only mentions it when includeScore is true', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const withoutScore = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    const withScore = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, includeScore: true, overallScore: 71 });
    expect(withoutScore).toContain('Do NOT mention any numeric score in this message');
    expect(withScore).toContain('overall score is 71/100');
  });

  it('uses a "Thanks, Dean, Founder, Bookrightly" email signature', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean Burt', findings });
    expect(prompt).toContain('Thanks,\n\nDean\nFounder, Bookrightly');
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

  it('the CTA points at the exact Bookrightly product URL, with real variation examples', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain(PRODUCT_URL);
    expect(prompt).toContain('You can have a look here');
    for (const cta of CTA_VARIATIONS) {
      expect(prompt).toContain(cta.replace('{link}', PRODUCT_URL));
    }
  });

  it('bans AI-hype language', () => {
    const findings = [{ id: 'a', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt.toLowerCase()).toContain('no "ai-powered"');
  });

  it('follow-up 1 points back at Bookrightly with low-pressure wording', () => {
    const prompt1 = buildFollowUpPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', stage: 1 });
    expect(prompt1).toContain(PRODUCT_URL);
    expect(prompt1).toContain('just following up on my earlier message');
    expect(prompt1).toContain('no obligation at all');
  });

  it('follow-up 2 is explicitly the final, lowest-pressure message', () => {
    const prompt = buildFollowUpPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', stage: 2 });
    expect(prompt.toLowerCase()).toContain('final');
    expect(prompt).toContain(PRODUCT_URL);
    expect(prompt).toContain('no pressure either way');
  });

  it('soft-mode prompt explicitly forbids manufacturing problems for a healthy site, still introduces Dean/Bookrightly, and still includes the product link', () => {
    const prompt = buildSoftPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings: [] });
    expect(prompt.toLowerCase()).toContain('do not manufacture problems');
    expect(prompt).toContain('Introduce yourself as Dean, a web developer and the founder of Bookrightly');
    expect(prompt).toContain(PRODUCT_URL);
  });

  it('business-type impact hint only appears when the industry is recognised, and never overrides real findings', () => {
    const findings = [{ id: 'a', category: 'performance', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const withIndustry = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings, industry: 'personal_trainer' });
    const withoutIndustry = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(withIndustry).toContain('go from finding your site to booking a session');
    expect(withoutIndustry).not.toContain('go from finding your site to booking a session');
  });
});

// ── No-real-website leads (Instagram/Facebook as "website") ────────────────
// A lead whose only "website" is a social media page needs a different
// opening observation ("you don't have a website" rather than a technical
// finding on one), but is otherwise the PRIMARY use case for Bookrightly —
// unlike the old Growth Audit pitch (which had nothing to offer someone
// with no site to audit), Bookrightly explicitly builds them one, so the
// product link and pitch still apply in full.
describe('growthAuditOutreachWriter — no-real-website leads (identity.socialOnly)', () => {
  const socialFinding = {
    id: NO_WEBSITE_FINDING_ID, category: 'conversion', severity: 'critical', confidence: 'high',
    title: 'No real website — just an Instagram page',
    outreachText: 'the link listed for your website actually goes to your Instagram page rather than a real website — so there\'s nothing of yours that ranks on Google, and the page itself is controlled by Instagram, not you',
  };

  it('hasNoRealWebsite detects the finding by id, regardless of other findings present', () => {
    expect(hasNoRealWebsite([socialFinding])).toBe(true);
    expect(hasNoRealWebsite([{ id: 'seo.missingTitle' }, socialFinding])).toBe(true);
    expect(hasNoRealWebsite([{ id: 'seo.missingTitle' }])).toBe(false);
    expect(hasNoRealWebsite([])).toBe(false);
    expect(hasNoRealWebsite(undefined)).toBe(false);
  });

  it('never claims an automated tool produced the finding, for a no-website lead', () => {
    const prompt = buildInitialPrompt({ businessName: 'Cheers Bar Lounge', channel: 'whatsapp', myName: 'Dean', findings: [socialFinding] });
    expect(prompt.toLowerCase()).not.toContain('growth audit');
    expect(prompt).toContain('NOT writing this message as a report generated by any tool');
  });

  it('still points a no-website lead at Bookrightly — that is the primary use case, not something to avoid', () => {
    const prompt = buildInitialPrompt({ businessName: 'Cheers Bar Lounge', channel: 'email', myName: 'Dean', findings: [socialFinding] });
    expect(prompt).toContain(PRODUCT_URL);
    expect(prompt).toContain(socialFinding.outreachText);
    expect(prompt).toContain("don't currently have their own website");
  });

  it('takes priority over other findings — opens on the no-website observation, not a technical finding, when both are present', () => {
    const otherFinding = { id: 'seo.missingTitle', category: 'seo', title: 'No page title', evidence: 'x', measurementType: 'measured' };
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings: [otherFinding, socialFinding] });
    expect(prompt).toContain(socialFinding.outreachText);
    expect(prompt).not.toContain('REAL FINDINGS AVAILABLE');
  });

  it('follow-ups for a no-website lead reference Bookrightly and the website/booking setup', () => {
    const followUp1 = buildFollowUpPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', stage: 1, findings: [socialFinding] });
    const followUp2 = buildFollowUpPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', stage: 2, findings: [socialFinding] });
    for (const prompt of [followUp1, followUp2]) {
      expect(prompt).toContain(PRODUCT_URL);
      expect(prompt.toLowerCase()).not.toContain('growth audit');
    }
    expect(followUp1).toContain('setting them up with a website and online booking through Bookrightly');
  });

  it('uses a tighter, combined structure for short channels (WhatsApp) than for email, given the much smaller word budget', () => {
    const emailPrompt = buildInitialPrompt({ businessName: 'Cheers Bar Lounge', channel: 'email', myName: 'Dean', findings: [socialFinding] });
    const waPrompt = buildInitialPrompt({ businessName: 'Cheers Bar Lounge', channel: 'whatsapp', myName: 'Dean', findings: [socialFinding] });
    expect(emailPrompt).toContain('3. OBSERVATION');
    expect(emailPrompt).toContain('4. WHAT BOOKRIGHTLY IS');
    expect(waPrompt).not.toContain('3. OBSERVATION');
    expect(waPrompt).toContain('tight word limit');
    expect(waPrompt).toContain(PRODUCT_URL);
  });

  it('a normal lead (no social-only finding) gets the standard findings-based pitch', () => {
    const findings = [{ id: 'seo.missingTitle', category: 'seo', title: 'x', evidence: 'x', measurementType: 'measured' }];
    const prompt = buildInitialPrompt({ businessName: 'T', channel: 'email', myName: 'Dean', findings });
    expect(prompt).toContain(PRODUCT_URL);
    expect(prompt).toContain('REAL FINDINGS AVAILABLE');
  });

  it('assessOutreachQuality requires the Bookrightly link for a no-website lead just like any other lead', () => {
    const body = `Hi Cheers Bar Lounge team, I'm Dean — a web developer and founder of Bookrightly. I noticed you don't currently have your own website. Bookrightly gives small businesses their own professional website and online booking system in one place. You can have a look here: ${PRODUCT_URL}. Would you be interested?`;
    const result = assessOutreachQuality(body, { businessName: 'Cheers Bar Lounge', channel: 'email', findingsUsed: [socialFinding] });
    expect(result.checks.includesAuditUrl).toBe(true);
  });
});
