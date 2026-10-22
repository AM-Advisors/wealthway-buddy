import { z } from 'zod';
const line = z.object({
  name: z.string().trim().min(1).max(160), monthlyCents: z.number().int().min(0).max(1e12),
  monthlyGrowth: z.number().finite().min(-1).max(1),
  startMonth: z.number().int().min(1).max(60), endMonth: z.number().int().min(1).max(60),
}).refine(l => l.endMonth >= l.startMonth, { message: 'End month must not precede start month.' });
export const operatingForecastInput = z.object({
  model: z.literal('operating'), startMonth: z.string().regex(/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/),
  months: z.number().int().min(1).max(60), directCostRate: z.number().finite().min(0).max(1),
  revenue: z.array(line).min(1).max(100), expenses: z.array(line).max(100),
});
export type OperatingForecastInput = z.infer<typeof operatingForecastInput>;
export type OperatingPeriod = { period: string; revenue: number; directCosts: number; operatingExpenses: number; expenses: number; profit: number; margin: number | null; monthCount: number };
const sum = (rows: OperatingPeriod[], key: 'revenue' | 'directCosts' | 'operatingExpenses' | 'expenses' | 'profit') => rows.reduce((s, r) => s + r[key], 0);
export function calculateOperatingForecast(raw: unknown) {
  const a = operatingForecastInput.parse(raw);
  const [year = 2026, month = 1] = a.startMonth.split('-').map(Number);
  const monthly: OperatingPeriod[] = [];
  const buckets = new Map<string, OperatingPeriod[]>();
  const amount = (lines: OperatingForecastInput['revenue'], i: number) => lines.reduce((s, l) => {
    if (i + 1 < l.startMonth || i + 1 > l.endMonth) return s;
    const cents = Math.round(l.monthlyCents * (1 + l.monthlyGrowth) ** (i + 1 - l.startMonth));
    if (!Number.isSafeInteger(cents)) throw new Error('Projected amounts exceed the supported range. Reduce growth or the forecast duration.');
    return s + cents;
  }, 0);
  for (let i = 0; i < a.months; i++) {
    const absolute = year * 12 + month - 1 + i, y = Math.floor(absolute / 12), m = absolute % 12 + 1;
    const revenue = amount(a.revenue, i), directCosts = Math.round(revenue * a.directCostRate), operatingExpenses = amount(a.expenses, i);
    const expenses = directCosts + operatingExpenses, profit = revenue - expenses;
    const row = { period: `${y}-${String(m).padStart(2, '0')}`, revenue, directCosts, operatingExpenses, expenses, profit, margin: revenue ? profit / revenue : null, monthCount: 1 };
    monthly.push(row);
    const quarter = `${y} Q${Math.ceil(m / 3)}`;
    buckets.set(quarter, [...(buckets.get(quarter) ?? []), row]);
  }
  const quarterly = [...buckets].map(([period, rows]) => {
    const revenue = sum(rows, 'revenue'), profit = sum(rows, 'profit');
    return { period, revenue, directCosts: sum(rows, 'directCosts'), operatingExpenses: sum(rows, 'operatingExpenses'), expenses: sum(rows, 'expenses'), profit, margin: revenue ? profit / revenue : null, monthCount: rows.length };
  });
  const totals = { revenue: sum(monthly, 'revenue'), expenses: sum(monthly, 'expenses'), profit: sum(monthly, 'profit'), directCosts: sum(monthly, 'directCosts'), operatingExpenses: sum(monthly, 'operatingExpenses') };
  if (Object.values(totals).some(n => !Number.isSafeInteger(n))) throw new Error('Forecast totals exceed the supported range.');
  return { totals, monthly, quarterly };
}
export function initialOperatingForecast(startMonth: string): OperatingForecastInput {
  return { model: 'operating', startMonth, months: 12, directCostRate: 0, revenue: [{ name: 'Revenue', monthlyCents: 0, monthlyGrowth: 0, startMonth: 1, endMonth: 12 }], expenses: [{ name: 'Operating expenses', monthlyCents: 0, monthlyGrowth: 0, startMonth: 1, endMonth: 12 }] };
}