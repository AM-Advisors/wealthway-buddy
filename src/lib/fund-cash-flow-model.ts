import { z } from 'zod';
const amount = z.number().finite().nonnegative().max(1e15);
export const fundForecastSchema = z.object({
  model: z.literal('fund'), openingNav: amount, openingCash: amount.optional(),
  periods: z.array(z.object({
    period: z.string().max(30), calls: amount, distributions: amount, fees: amount, expenses: amount,
    gain: z.number().finite().min(-1e15).max(1e15),
    growth: z.number().finite().min(-1).max(10).optional(), realizedProceeds: amount.optional(),
  })).max(200),
});
export const fundForecastInput = fundForecastSchema.refine(a => (a.openingCash ?? 0) <= a.openingNav, { message: 'Opening cash cannot exceed opening NAV.' });
// The union needs an object; validate the cross-field invariant in the calculator.
export type FundForecastInput = z.infer<typeof fundForecastInput>;
export function calculateFundCashFlow(raw: unknown) {
  const a = fundForecastInput.parse(raw);
  let nav = a.openingNav, cash = a.openingCash ?? 0, called = 0, distributed = 0, expenses = 0, fees = 0, gain = 0, proceeds = 0;
  const detail = a.periods.map(p => {
    const openingNav = nav, openingCash = cash;
    const projectedGain = p.gain + Math.round(openingNav * (p.growth ?? 0));
    const inflows = p.calls + (p.realizedProceeds ?? 0), outflows = p.distributions + p.fees + p.expenses;
    cash += inflows - outflows;
    nav += p.calls + projectedGain - outflows;
    if (nav < 0) throw new Error('Projected NAV cannot be negative.');
    if (![nav, cash, projectedGain].every(Number.isSafeInteger)) throw new Error('Projected amounts exceed supported precision.');
    called += p.calls; distributed += p.distributions; expenses += p.expenses; fees += p.fees; gain += projectedGain; proceeds += p.realizedProceeds ?? 0;
    return { ...p, openingNav, openingCash, projectedGain, inflows, outflows, netCashFlow: inflows - outflows, cash, shortfall: Math.max(0, -cash), nav, called, distributed, dpi: called ? distributed / called : null, tvpi: called ? (nav + distributed) / called : null };
  });
  return { detail, totals: { nav, cash, called, distributed, expenses, fees, gain, proceeds, netCashFlow: cash - (a.openingCash ?? 0), shortfall: Math.max(0, ...detail.map(p => p.shortfall)), dpi: called ? distributed / called : null, tvpi: called ? (nav + distributed) / called : null } };
}