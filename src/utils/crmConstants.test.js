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
    const result = applyTemplateVars('End.{{signature}}', { signature: '\n\nKind regards,\nDean' });
    expect(result).toBe('End.\n\nKind regards,\nDean');
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

  it('falls back to a business-team greeting when there is no contact name', () => {
    const vars = buildTemplateVars({ businessName: 'Acme' });
    expect(vars.greeting).toBe('Acme team');
  });

  it('falls back to "there" when there is neither a contact name nor a business name', () => {
    const vars = buildTemplateVars({});
    expect(vars.greeting).toBe('there');
  });

  it('includes the free audit tool link', () => {
    const vars = buildTemplateVars({ businessName: 'Acme' });
    expect(vars.audit_link).toContain('https://app.dean-da-dev.co.uk');
  });

  it('builds a full signature only when a name is given', () => {
    expect(buildTemplateVars({}, { myName: 'Dean Burt' }).signature).toContain('Dean Burt');
    expect(buildTemplateVars({}, {}).signature).toBe('');
  });
});

describe('sortTemplatesByRelevance', () => {
  it('puts General Outreach first', () => {
    const templates = [{ name: 'Follow Up' }, { name: 'Broken Website' }, { name: 'General Outreach' }];
    const sorted = sortTemplatesByRelevance(templates);
    expect(sorted[0].name).toBe('General Outreach');
  });

  it('sorts unranked custom templates after every known one, alphabetically', () => {
    const templates = [{ name: 'Zebra Custom' }, { name: 'General Outreach' }, { name: 'Alpha Custom' }];
    const sorted = sortTemplatesByRelevance(templates);
    expect(sorted.map((t) => t.name)).toEqual(['General Outreach', 'Alpha Custom', 'Zebra Custom']);
  });

  it('does not mutate the input array', () => {
    const templates = [{ name: 'Follow Up' }, { name: 'General Outreach' }];
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
