import { Plus, Trash2 } from 'lucide-react';
import type { FundForecastInput } from '@/lib/fund-cash-flow-model';
import { dollarsToCents, percentToRate } from '@/lib/forecast-form-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
function Amount({ label, value, change, percent = false }: { label: string; value: number; change: (n: number) => void; percent?: boolean }) {
  return <div className="min-w-0 space-y-1.5"><Label>{label} ({percent ? '%' : 'USD'})</Label><Input aria-label={label} type="number" step={percent ? '0.1' : '0.01'} value={percent ? Number((value * 100).toFixed(8)) : value / 100} onChange={e => change(percent ? percentToRate(e.target.value) : dollarsToCents(e.target.value))} /></div>;
}
export function FundCashFlowForm({ value: a, onChange }: { value: FundForecastInput; onChange: (v: FundForecastInput) => void }) {
  const year = new Date().getFullYear();
  const options = Array.from({ length: 11 }, (_, i) => year + i).flatMap(y => [1, 2, 3, 4].map(q => `${y} Q${q}`));
  return <section aria-label="Fund cash-flow assumptions" className="min-w-0 space-y-5"><div className="grid gap-3 sm:grid-cols-2"><Amount label="Opening NAV" value={a.openingNav} change={openingNav => onChange({ ...a, openingNav })} /><Amount label="Opening cash" value={a.openingCash ?? 0} change={openingCash => onChange({ ...a, openingCash })} /></div>
    {a.periods.map((p, i) => {
      const patch = (change: Partial<typeof p>) => onChange({ ...a, periods: a.periods.map((x, j) => i === j ? { ...x, ...change } : x) });
      return <fieldset key={i} className="min-w-0 space-y-3 border-b pb-5"><legend className="font-medium">Period {i + 1}</legend><div className="flex items-center justify-between gap-3"><div className="min-w-0 flex-1 space-y-1.5"><Label>Payment period</Label><Select value={p.period} onValueChange={period => patch({ period })}><SelectTrigger aria-label={`Payment period ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{[...new Set([p.period, ...options])].map(period => <SelectItem key={period} value={period}>{period}</SelectItem>)}</SelectContent></Select></div><Button size="icon" variant="ghost" title={`Remove period ${i + 1}`} aria-label={`Remove period ${i + 1}`} onClick={() => onChange({ ...a, periods: a.periods.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button></div><div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3"><Amount label={`Growth per period ${i + 1}`} percent value={p.growth ?? 0} change={growth => patch({ growth })} /><Amount label={`Expenses ${i + 1}`} value={p.expenses} change={expenses => patch({ expenses })} /><Amount label={`Fees ${i + 1}`} value={p.fees} change={fees => patch({ fees })} /><Amount label={`Capital calls ${i + 1}`} value={p.calls} change={calls => patch({ calls })} /><Amount label={`Distributions ${i + 1}`} value={p.distributions} change={distributions => patch({ distributions })} /><Amount label={`Realized investment proceeds ${i + 1}`} value={p.realizedProceeds ?? 0} change={realizedProceeds => patch({ realizedProceeds })} /><Amount label={`Additional gain / loss ${i + 1}`} value={p.gain} change={gain => patch({ gain })} /></div></fieldset>;
    })}<Button variant="outline" disabled={a.periods.length >= 200} onClick={() => {
      const last = a.periods.at(-1)?.period.match(/^(\d{4}) Q([1-4])$/);
      const period = last ? `${Number(last[1]) + (Number(last[2]) === 4 ? 1 : 0)} Q${Number(last[2]) % 4 + 1}` : `${year} Q${Math.floor(new Date().getMonth() / 3) + 1}`;
      onChange({ ...a, periods: [...a.periods, { period, calls: 0, distributions: 0, fees: 0, expenses: 0, gain: 0, growth: 0, realizedProceeds: 0 }] });
    }}><Plus className="h-4 w-4" />Add period</Button></section>;
}