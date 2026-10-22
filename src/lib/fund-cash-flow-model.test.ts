import { describe, it, expect } from 'vitest';
import { calculateFundCashFlow } from './fund-cash-flow-model';
import { calculateForecast, forecastInput } from './forecast-model';
const period = { period: '2027 Q1', calls: 20000, distributions: 10000, fees: 1000, expenses: 2000, gain: 0 };
describe('guided fund cash-flow projections', () => {
  it('reconciles capital calls, distributions, fees and expenses in cash', () => {
    const r = calculateFundCashFlow({ model: 'fund', openingNav: 100000, openingCash: 50000, periods: [period] });
    expect(r.totals.cash).toBe(57000); expect(r.totals.netCashFlow).toBe(7000); expect(r.totals.nav).toBe(107000);
  });
  it('compounds growth on opening NAV without inventing cash', () => {
    const r = calculateFundCashFlow({ model: 'fund', openingNav: 100000, openingCash: 50000, periods: [{ ...period, growth: .1 }, { ...period, growth: .1 }] });
    expect(r.detail.map(p => p.projectedGain)).toEqual([10000, 11700]); expect(r.totals.cash).toBe(64000); expect(r.totals.nav).toBe(135700);
  });
  it('records projected realized proceeds as cash, not extra NAV or growth', () => {
    const r = calculateFundCashFlow({ model: 'fund', openingNav: 100000, openingCash: 0, periods: [{ ...period, realizedProceeds: 30000 }] });
    expect(r.totals.cash).toBe(37000); expect(r.totals.nav).toBe(107000);
  });
  it('shows a cash shortfall even when NAV remains positive', () => {
    const r = calculateFundCashFlow({ model: 'fund', openingNav: 100000, periods: [{ ...period, calls: 0 }] });
    expect(r.totals.shortfall).toBe(13000); expect(r.totals.cash).toBe(-13000);
  });
  it('preserves legacy periods and uses the same preview/save calculation', () => {
    const a = { model: 'fund', openingNav: 100000, periods: [period] };
    expect(calculateForecast(forecastInput.parse(a))).toEqual(calculateFundCashFlow(a));
    expect(a.periods[0]).toEqual(period);
  });
  it('rejects cash exceeding NAV and invalid growth', () => {
    expect(() => calculateFundCashFlow({ model: 'fund', openingNav: 0, openingCash: 1, periods: [] })).toThrow();
    expect(() => calculateFundCashFlow({ model: 'fund', openingNav: 100000, periods: [{ ...period, growth: -1.1 }] })).toThrow();
  });
});