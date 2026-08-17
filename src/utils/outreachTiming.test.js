import { describe, expect, it } from 'vitest';
import { getOutreachTiming, nextRecommendedOutreachTime, toDateTimeLocal } from './outreachTiming';

describe('outreach timing', () => {
  it('recommends the first Tuesday email window from a Monday', () => {
    const now = new Date(2026, 7, 17, 16, 0);
    const next = nextRecommendedOutreachTime('email', now);
    expect(next.getDay()).toBe(2);
    expect([next.getHours(), next.getMinutes()]).toEqual([9, 35]);
  });

  it('uses the afternoon backup when the morning window has passed', () => {
    const now = new Date(2026, 7, 18, 11, 0);
    const next = nextRecommendedOutreachTime('email', now);
    expect([next.getHours(), next.getMinutes()]).toEqual([14, 10]);
  });

  it('skips weekends and formats datetime-local values', () => {
    const now = new Date(2026, 7, 21, 16, 0);
    const next = nextRecommendedOutreachTime('linkedin', now);
    expect(next.getDay()).toBe(2);
    expect(toDateTimeLocal(new Date(2026, 7, 18, 9, 35))).toBe('2026-08-18T09:35');
  });

  it('provides respectful manual-channel guidance', () => {
    expect(getOutreachTiming('whatsapp').summary).toMatch(/avoid mornings, lunch and evenings/i);
  });
});

