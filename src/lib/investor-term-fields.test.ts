import { describe, it, expect } from 'vitest';
import { INVESTOR_TERM_FIELDS, investorFieldValue, setInvestorField } from './investor-term-fields';
describe('per-investor fee and minimum entry', () => {
  it('records a zero management fee instead of treating it as blank', () => {
    const field = INVESTOR_TERM_FIELDS[0];
    expect(setInvestorField([], field, '0', 'fee')[0]?.value).toBe('0%');
  });
  it('keeps fee, carry and minimum as separate terms in one letter', () => {
    const terms = INVESTOR_TERM_FIELDS.reduce((terms, field, i) => setInvestorField(terms, field, ['0','20','50000'][i] ?? '', field.key), [] as import('./side-letter-model').SideLetterTerm[]);
    expect(terms.map(t => t.value)).toEqual(['0%','20%','$50000']);
    expect(investorFieldValue(terms, INVESTOR_TERM_FIELDS[2])).toBe('50000');
  });
  it('blank removes only the chosen exception, preserving unrelated and carry terms', () => {
    const terms = setInvestorField(setInvestorField([], INVESTOR_TERM_FIELDS[0], '6', 'fee'), INVESTOR_TERM_FIELDS[1], '20', 'carry');
    expect(setInvestorField(terms, INVESTOR_TERM_FIELDS[0], '', 'unused').map(t => t.value)).toEqual(['20%']);
  });
});