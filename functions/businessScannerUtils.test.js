import { describe, expect, test } from 'vitest';

const {
  isLookupCacheFresh,
  sortBusinessLeads,
  timestampToMillis,
  unavailableLead,
} = require('./businessScannerUtils');

describe('businessScannerUtils', () => {
  const now = Date.UTC(2026, 7, 17);

  test('ranks verified high-opportunity leads before unavailable details', () => {
    const sorted = sortBusinessLeads([
      { id: 'failed', detailsUnavailable: true, opportunityScore: 99, reviewCount: 1 },
      { id: 'medium', opportunityScore: 3, reviewCount: 20 },
      { id: 'best', opportunityScore: 5, reviewCount: 80 },
    ]);
    expect(sorted.map((lead) => lead.id)).toEqual(['best', 'medium', 'failed']);
  });

  test('expires negative cache results after 60 days', () => {
    expect(isLookupCacheFresh({ checkedAt: new Date(now - 59 * 86_400_000) }, now)).toBe(true);
    expect(isLookupCacheFresh({ checkedAt: new Date(now - 61 * 86_400_000) }, now)).toBe(false);
  });

  test('keeps positive contact results for up to a year', () => {
    expect(isLookupCacheFresh({ email: 'hello@example.com', checkedAt: new Date(now - 300 * 86_400_000) }, now)).toBe(true);
    expect(isLookupCacheFresh({ email: 'hello@example.com', checkedAt: new Date(now - 366 * 86_400_000) }, now)).toBe(false);
  });

  test('supports Firestore timestamps and marks failed details as unknown', () => {
    const date = new Date(now);
    expect(timestampToMillis({ toDate: () => date })).toBe(now);
    expect(unavailableLead({ place_id: 'p1', name: 'Example', rating: 4.7 }).hasWebsite).toBeNull();
    expect(unavailableLead({ place_id: 'p1', name: 'Example' }).opportunityLabel).toMatch(/unavailable/i);
  });
});
