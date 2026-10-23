import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { exposureBreakdown, topConcentration, type ExposureDimension, type PortfolioPosition } from '@/lib/portfolio-workspace-model';
import { money } from '@/lib/status';

const DIMENSIONS: [ExposureDimension, string][] = [['assetClass', 'Asset class'], ['fund', 'Fund'], ['vintage', 'Vintage'], ['stage', 'Stage'], ['risk', 'Risk rating']];
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export function PortfolioExposure({ rows }: { rows: PortfolioPosition[] }) {
  const [dim, setDim] = useState<ExposureDimension>('assetClass');
  const slices = exposureBreakdown(rows, dim);
  const byValue = slices.some((s) => s.valueCents > 0);
  const top = topConcentration(slices);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Group exposure by">
        {DIMENSIONS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={dim === k} onClick={() => setDim(k)} className={`rounded-full border px-3 py-1 text-sm ${dim === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>{l}</button>
        ))}
      </div>
      {slices.length === 0 ? <p className="text-sm text-muted-foreground">No positions for this selection.</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">{byValue ? 'Share of approved value' : 'Positions'}</CardTitle></CardHeader><CardContent className="h-64">
            <ResponsiveContainer><PieChart><Pie data={slices} dataKey={byValue ? 'valueCents' : 'positions'} nameKey="label" innerRadius={50} outerRadius={90}>{slices.map((s, i) => <Cell key={s.key} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => (byValue ? money(Number(v)) : v)} /></PieChart></ResponsiveContainer>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Positions by group</CardTitle></CardHeader><CardContent className="h-64">
            <ResponsiveContainer><BarChart data={slices}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="positions" fill="var(--chart-1)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          </CardContent></Card>
        </div>
      )}
      {byValue && top >= 40 ? <p className="text-sm text-destructive">Concentration: one group holds {top}% of approved value.</p> : null}
      <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Group</th><th>Positions</th><th>Approved value</th><th>Share</th></tr></thead>
        <tbody>{slices.map((s) => <tr key={s.key} className="border-t"><td className="py-2 capitalize">{s.label}</td><td>{s.positions}</td><td>{s.valueCents ? money(s.valueCents) : 'Unavailable'}</td><td>{byValue ? `${s.share}%` : ' · '}</td></tr>)}</tbody></table>
      <p className="text-xs text-muted-foreground">Values use approved, effective marks only. Positions without a mark are counted but add no value.</p>
    </div>
  );
}
