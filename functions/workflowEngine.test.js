import { describe, it, expect } from 'vitest';
import { evaluateCondition } from './workflowEngine.js';

describe('evaluateCondition', () => {
  it('equals matches on strict equality', () => {
    expect(evaluateCondition({ field: 'status', operator: 'equals', value: 'New' }, { status: 'New' })).toBe(true);
    expect(evaluateCondition({ field: 'status', operator: 'equals', value: 'New' }, { status: 'Won' })).toBe(false);
  });

  it('not_equals is the inverse of equals', () => {
    expect(evaluateCondition({ field: 'status', operator: 'not_equals', value: 'New' }, { status: 'Won' })).toBe(true);
    expect(evaluateCondition({ field: 'status', operator: 'not_equals', value: 'New' }, { status: 'New' })).toBe(false);
  });

  // Regression guard, mirroring the crm project's equivalent test — a
  // string being coerced by a loose `>`/`<` comparison ("70" > 9 is false
  // in JS but a naive Number(actual) > value could silently "pass" on
  // garbage input) is exactly the kind of bug a type guard here prevents.
  it('greater_than only matches when the actual value is a real number', () => {
    expect(evaluateCondition({ field: 'intentScore', operator: 'greater_than', value: 70 }, { intentScore: 85 })).toBe(true);
    expect(evaluateCondition({ field: 'intentScore', operator: 'greater_than', value: 70 }, { intentScore: 50 })).toBe(false);
    expect(evaluateCondition({ field: 'intentScore', operator: 'greater_than', value: 70 }, { intentScore: '85' })).toBe(false);
    expect(evaluateCondition({ field: 'intentScore', operator: 'greater_than', value: 70 }, { intentScore: null })).toBe(false);
  });

  it('less_than only matches when the actual value is a real number', () => {
    expect(evaluateCondition({ field: 'leadScore', operator: 'less_than', value: 20 }, { leadScore: 10 })).toBe(true);
    expect(evaluateCondition({ field: 'leadScore', operator: 'less_than', value: 20 }, { leadScore: 30 })).toBe(false);
    expect(evaluateCondition({ field: 'leadScore', operator: 'less_than', value: 20 }, { leadScore: 'ten' })).toBe(false);
  });

  it('contains only matches when the actual value is a real string', () => {
    expect(evaluateCondition({ field: 'source', operator: 'contains', value: 'Google' }, { source: 'Google Maps' })).toBe(true);
    expect(evaluateCondition({ field: 'source', operator: 'contains', value: 'Google' }, { source: 'Referral' })).toBe(false);
    expect(evaluateCondition({ field: 'source', operator: 'contains', value: 'Google' }, { source: 123 })).toBe(false);
  });

  it('an unknown operator never matches', () => {
    expect(evaluateCondition({ field: 'status', operator: 'starts_with', value: 'N' }, { status: 'New' })).toBe(false);
  });

  it('a missing field is treated as no match rather than throwing', () => {
    expect(evaluateCondition({ field: 'notAField', operator: 'equals', value: 'x' }, {})).toBe(false);
  });
});
