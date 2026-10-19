import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { assessmentGrade, DEFAULT_THRESHOLDS } from '@/lib/report-card-model';

export type MetricDraft = { label: string; score: string; weight: string; evidence: string };
export const blankMetric = (label = '', weight = '1'): MetricDraft => ({ label, score: '', weight, evidence: '' });

/** Several scored measures per assessment; the preview uses the same grading engine the server publishes with. */
export function MetricEditor({ rows, onChange, weights, thresholds }: { rows: MetricDraft[]; onChange: (rows: MetricDraft[]) => void; weights: Record<string, number>; thresholds?: number[] | undefined }) {
  const set = (i: number, patch: Partial<MetricDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const preview = assessmentGrade(rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label, score: r.score === '' ? null : Number(r.score), weight: Number(r.weight) || 1, evidence: r.evidence })), thresholds ?? DEFAULT_THRESHOLDS);
  const suggested = Object.keys(weights).filter((k) => !rows.some((r) => r.label === k));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input aria-label={`Measure ${i + 1}`} placeholder="Measure" value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
          <Input aria-label={`Score ${i + 1}`} type="number" min={0} max={100} placeholder="Score 0–100" value={r.score} onChange={(e) => set(i, { score: e.target.value })} />
          <Input aria-label={`Weight ${i + 1}`} type="number" min={0.1} max={5} step={0.1} placeholder="Weight" value={r.weight} onChange={(e) => set(i, { weight: e.target.value })} />
          <Button type="button" variant="ghost" size="sm" disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</Button>
          <Input aria-label={`Evidence ${i + 1}`} className="sm:col-span-4" placeholder="Evidence reference (required for the score to count)" value={r.evidence} onChange={(e) => set(i, { evidence: e.target.value })} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={rows.length >= 30} onClick={() => onChange([...rows, blankMetric()])}>Add measure</Button>
        {suggested.slice(0, 6).map((k) => (
          <Button key={k} type="button" variant="ghost" size="sm" onClick={() => onChange([...rows.filter((r) => r.label.trim()), blankMetric(k, String(weights[k] ?? 1))])}>+ {k}</Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Preview: <b className="text-foreground">{preview.grade}</b>{preview.score !== null ? ` (${preview.score}/100)` : ''} · {preview.coverage}% of measures have a score and evidence</p>
    </div>
  );
}
