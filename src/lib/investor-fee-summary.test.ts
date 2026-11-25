import { describe, expect, it } from 'vitest';
import { investorFeeSummary } from './investor-economics-model';

const defaults = { fee: 6, carry: 20 };
const investment = { offeringId: 'erebor', onboardingId: 'trust' };
const today = new Date('2026-11-25T02:34:00Z');
const letter = (over: Record<string, unknown> = {}) => ({
  id: 'letter', offering_id: 'erebor', onboarding_id: 'trust', status: 'active', effective_date: null, expiry_date: null,
  terms: [{ category: 'fee_discount', value: '0%' }, { category: 'carry_reduction', value: '0%' }], ...over,
});

describe('investor side-letter fee summary', () => {
  it('shows zero management fee and carry over Erebor defaults without mutating them', () => {
    expect(investorFeeSummary(defaults, [letter()], investment, today)).toEqual({ fee: 0, carry: 0, source: 'Side letter' });
    expect(defaults).toEqual({ fee: 6, carry: 20 });
  });
  it('keeps defaults for terms not changed by the letter', () => {
    expect(investorFeeSummary(defaults, [letter({ terms: [{ category: 'fee_discount', value: '0%' }] })], investment, today)).toEqual({ fee: 0, carry: 20, source: 'Side letter' });
  });
  it('never applies another investment or fund letter', () => {
    expect(investorFeeSummary(defaults, [letter({ onboarding_id: 'someone-else' }), letter({ offering_id: 'other-fund' }), letter({ onboarding_id: null })], investment, today)).toEqual({ ...defaults, source: 'Fund default' });
  });
  it('ignores proposed, terminated, expired and future letters', () => {
    expect(investorFeeSummary(defaults, [letter({ status: 'proposed' }), letter({ status: 'terminated' }), letter({ expiry_date: '2026-11-24' }), letter({ effective_date: '2026-11-26' })], investment, today)).toEqual({ ...defaults, source: 'Fund default' });
  });
  it('includes an effective letter expiring today', () => {
    expect(investorFeeSummary(defaults, [letter({ effective_date: '2026-11-25', expiry_date: '2026-11-25' })], investment, today).fee).toBe(0);
  });
  it('refuses conflicting active rates rather than silently showing fund defaults', () => {
    expect(() => investorFeeSummary(defaults, [letter(), letter({ terms: [{ category: 'fee_discount', value: '1%' }] })], investment, today)).toThrow('different fees');
  });
  it('refuses an unparseable fee exception', () => {
    expect(() => investorFeeSummary(defaults, [letter({ terms: [{ category: 'fee_discount', value: '20% off' }] })], investment, today)).toThrow('need review');
  });
});