import { describe, it, expect } from 'vitest';
import {
  applyTemplateVars,
  buildTemplateVars,
  sortTemplatesByRelevance,
  slugify,
  WEBSITE_ISSUES,
  ISSUE_DETAILS,
} from './crmConstants';

describe('applyTemplateVars', () => {
  it('substitutes known variables', () => {
    expect(applyTemplateVars('Hi {{contact}},', { contact: 'Sam' })).toBe('Hi Sam,');
  });

  it('drops missing/empty variables to an empty string', () => {
    expect(applyTemplateVars('Hi {{contact}},', {})).toBe('Hi,');
  });

  it('cleans up punctuation left behind by a dropped variable', () => {
    expect(applyTemplateVars('Thank you, {{contact}}!', {})).toBe('Thank you!');
    expect(applyTemplateVars('Hi {{contact}}, hope you are well?', {})).toBe('Hi, hope you are well?');
  });

  it('preserves a leading "\\n\\n" in a computed clause instead of trimming it', () => {
    const result = applyTemplateVars('End.{{portfolio_line}}', { portfolio_line: '\n\nSee: example.com' });
    expect(result).toBe('End.\n\nSee: example.com');
  });

  it('returns an empty string for falsy input', () => {
    expect(applyTemplateVars('', {})).toBe('');
    expect(applyTemplateVars(undefined, {})).toBe('');
  });
});

describe('buildTemplateVars', () => {
  it('fills in the basics from the lead', () => {
    const vars = buildTemplateVars({ businessName: 'Acme', contactName: 'Sam', website: 'acme.com', industry: 'Salon' }, { myName: 'Dean' });
    expect(vars.business).toBe('Acme');
    expect(vars.contact).toBe('Sam');
    expect(vars.website).toBe('acme.com');
    expect(vars.myname).toBe('Dean');
  });

  it('prefers the real AI design note over the generic per-issue wording', () => {
    const vars = buildTemplateVars({ issuesChecklist: ['Slow Loading'], aiDesignNote: 'the hero image takes 8 seconds to load.' });
    expect(vars.issue_highlight).toContain('the hero image takes 8 seconds to load');
  });

  it('falls back to ISSUE_DETAILS when there is no AI design note', () => {
    const vars = buildTemplateVars({ issuesChecklist: ['Missing SSL'] });
    expect(vars.issue_highlight).toBe(` — ${ISSUE_DETAILS['Missing SSL']}`);
  });

  it('lists every checked issue, not just the first one', () => {
    const vars = buildTemplateVars({ issuesChecklist: ['Missing SSL', 'Slow Loading'] });
    expect(vars.issue_list).toContain('Missing SSL');
    expect(vars.issue_list).toContain('Slow Loading');
  });

  it('includes a competitor comparison when a stronger nearby competitor was found', () => {
    const vars = buildTemplateVars({ competitorName: 'Rival Salon', competitorRating: 4.8, competitorReviewCount: 120 });
    expect(vars.competitor_line).toContain('Rival Salon');
    expect(vars.competitor_line).toContain('4.8');
  });

  // Regression test: the "Website Audit Findings" template used to mention a
  // competitor's star rating even when the site was completely broken
  // ("Site Doesn't Load"/"Broken Links") — a tonally mismatched thing to say
  // right after "your site isn't working". See crmConstants.js buildTemplateVars.
  it('suppresses the competitor comparison when the site does not load', () => {
    const vars = buildTemplateVars({
      issuesChecklist: ["Site Doesn't Load"],
      competitorName: 'Rival Salon', competitorRating: 4.8, competitorReviewCount: 120,
    });
    expect(vars.competitor_line).toBe('');
  });

  it('suppresses the competitor comparison for a broken-links (404) site too', () => {
    const vars = buildTemplateVars({
      issuesChecklist: ['Broken Links'],
      competitorName: 'Rival Salon', competitorRating: 4.8, competitorReviewCount: 120,
    });
    expect(vars.competitor_line).toBe('');
  });
});

describe('sortTemplatesByRelevance', () => {
  it('puts Website Audit Findings first', () => {
    const templates = [{ name: 'Follow Up' }, { name: 'Website Audit Findings' }, { name: 'General Outreach' }];
    const sorted = sortTemplatesByRelevance(templates);
    expect(sorted[0].name).toBe('Website Audit Findings');
  });

  it('sorts unranked custom templates after every known one, alphabetically', () => {
    const templates = [{ name: 'Zebra Custom' }, { name: 'Website Audit Findings' }, { name: 'Alpha Custom' }];
    const sorted = sortTemplatesByRelevance(templates);
    expect(sorted.map((t) => t.name)).toEqual(['Website Audit Findings', 'Alpha Custom', 'Zebra Custom']);
  });

  it('does not mutate the input array', () => {
    const templates = [{ name: 'Follow Up' }, { name: 'Website Audit Findings' }];
    const copy = [...templates];
    sortTemplatesByRelevance(templates);
    expect(templates).toEqual(copy);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Website Audit Findings')).toBe('website-audit-findings');
  });

  it('strips leading/trailing hyphens from punctuation at the edges', () => {
    expect(slugify(" Site Doesn't Load! ")).toBe('site-doesn-t-load');
  });
});

describe('WEBSITE_ISSUES / ISSUE_DETAILS stay in sync', () => {
  it('has a details entry for every issue in the checklist', () => {
    for (const issue of WEBSITE_ISSUES) {
      if (issue === 'Other') continue; // deliberately has no fixed wording
      expect(ISSUE_DETAILS[issue], `missing ISSUE_DETAILS entry for "${issue}"`).toBeTruthy();
    }
  });
});
