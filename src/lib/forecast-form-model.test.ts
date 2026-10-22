import { describe, it, expect } from 'vitest';
import { dollarsToCents, percentToRate, forecastYears, newRound, selectHolding } from './forecast-form-model';
import { calculateForecast, forecastInput } from './forecast-model';
describe('guided forecast assumptions', () => {
  it('converts dollar entries to the existing cents contract', () => { expect(dollarsToCents('1500.25')).toBe(150025); expect(dollarsToCents('')).toBe(0); });
  it('converts percentage entries to the existing rate contract', () => { expect(percentToRate('12.5')).toBe(.125); });
  it('preserves existing historical and distant exit years in choices', () => { expect(forecastYears(2026, [2021, 2100])).toContain(2021); expect(forecastYears(2026, [2021, 2100])).toContain(2100); });
  it('copies a selected cap-table holding without modifying recorded holdings', () => { const recorded = Object.freeze({ holder: 'Fictional holder', class: 'Preferred', shares: 250 }); const original = [{ holder: 'Other fictional holder', class: 'Common', shares: 10 }]; const selected = selectHolding(original, 0, recorded); expect(selected[0]).toEqual(recorded); expect(selected[0]).not.toBe(recorded); expect(original[0]?.shares).toBe(10); });
  it('creates a valid round and preserves previously saved note assumptions', () => { const input = { model: 'cap_table', holders: [{ holder: 'Fictional founder', class: 'Common', shares: 100 }], rounds: [{ ...newRound(), conversions: [{ holder: 'Fictional note', class: 'Preferred', principal: 10000, interest: .05, years: 2, discount: .2, cap: 50000000 }] }] }; expect(forecastInput.parse(input)).toEqual(input); expect(calculateForecast(input).totals['shares']).toBeCloseTo(100.022); });
});