/**
 * Accessible dashboard visuals: labelled bars with visible values, keyboard/tap
 * drill-down, and explicit empty / unavailable states. Color is never the only cue.
 */
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { money } from "@/lib/status";

export type Row = { key: string; label: string; count: number; percent: number | null };

export function Definition({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger type="button" aria-label="Definition" className="ml-1 inline-flex align-middle text-muted-foreground"><Info className="h-3.5 w-3.5" /></TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

export function Kpi({ label, value, hint, onClick, definition }: { label: string; value: ReactNode; hint?: string; onClick?: () => void; definition?: string }) {
  const body = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}{definition ? <Definition text={definition} /> : null}</p>
      <p className="mt-0.5 text-2xl font-semibold leading-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="min-w-0 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</button>
    : <div className="min-w-0 rounded-lg border bg-card px-3 py-2">{body}</div>;
}

export function KpiSkeleton({ n = 6 }: { n?: number }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
}

export function ChartCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle>{description ? <CardDescription>{description}</CardDescription> : null}</CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Horizontal labelled bars. Each row is a button when drill-down exists. */
export function BarList({ rows, onSelect, empty, ariaLabel }: { rows: Row[]; onSelect?: (key: string) => void; empty: string; ariaLabel: string }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (!total) return <EmptyState>{empty}</EmptyState>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul aria-label={ariaLabel} className="space-y-1.5">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="w-28 shrink-0 truncate text-sm sm:w-36">{r.label}</span>
            <span className="relative h-5 min-w-0 flex-1 rounded bg-muted" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="w-16 shrink-0 text-right text-sm tabular-nums"><strong>{r.count}</strong>{r.percent !== null ? <span className="text-muted-foreground"> · {r.percent}%</span> : null}</span>
          </>
        );
        return (
          <li key={r.key}>
            {onSelect
              ? <button type="button" onClick={() => onSelect(r.key)} aria-label={`${r.label}: ${r.count}. Open list`} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{inner}</button>
              : <div className="flex items-center gap-2 px-1 py-0.5">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function CapitalBars({ intended, awaiting, funded, target, definitions }: { intended: number; awaiting?: number; funded: number; target?: number | null; definitions: { intended: string; awaitingFunding: string; funded: string } }) {
  const rows = [
    { label: "Intended", value: intended, def: definitions.intended },
    ...(awaiting !== undefined ? [{ label: "Awaiting funding", value: awaiting, def: definitions.awaitingFunding }] : []),
    { label: "Reconciled funded", value: funded, def: definitions.funded },
  ];
  if (!intended && !funded) return <EmptyState>No investment amounts recorded yet.</EmptyState>;
  const max = Math.max(target ?? 0, ...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm"><span>{r.label}<Definition text={r.def ?? ""} /></span><strong className="tabular-nums">{money(r.value)}</strong></div>
          <div className="mt-1 h-2.5 rounded bg-muted" aria-hidden><div className="h-full rounded bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
      {target ? <p className="text-xs text-muted-foreground">Fund target size {money(target)} · {Math.round((funded / target) * 100)}% funded</p> : <p className="text-xs text-muted-foreground">No target size recorded for comparison.</p>}
    </div>
  );
}

export function TrendChart({ data }: { data: { bucket: string; started: number; completed: number }[] | null }) {
  if (!data) return <EmptyState>Trend data will appear as onboarding activity is recorded.</EmptyState>;
  const config = { started: { label: "Started", color: "var(--primary)" }, completed: { label: "Funded", color: "var(--accent-foreground)" } };
  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-52 w-full">
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis allowDecimals={false} width={24} fontSize={11} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="started" fill="var(--color-started)" radius={3} />
          <Bar dataKey="completed" fill="var(--color-completed)" radius={3} />
        </BarChart>
      </ChartContainer>
      <p className="sr-only">{data.map((d) => `${d.bucket}: ${d.started} started, ${d.completed} funded`).join("; ")}</p>
    </>
  );
}

const PALETTE: string[] = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)"];

/** Donut with a visible legend (label, count, percent) — colour is never the only cue. */
export function DonutChart({ rows, ariaLabel, empty, onSelect }: { rows: Row[]; ariaLabel: string; empty: string; onSelect?: (key: string) => void }) {
  const data = rows.filter((r) => r.count > 0);
  if (!data.length) return <EmptyState>{empty}</EmptyState>;
  const config = Object.fromEntries(data.map((r, i) => [r.key, { label: r.label, color: PALETTE[i % PALETTE.length] as string }]));
  const total = data.reduce((n, r) => n + r.count, 0);
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row" aria-label={ariaLabel}>
      <ChartContainer config={config} className="aspect-square h-40 shrink-0">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
          <Pie data={data} dataKey="count" nameKey="key" innerRadius={42} outerRadius={70} strokeWidth={2}>
            {data.map((r, i) => <Cell key={r.key} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="w-full space-y-1 text-sm">
        {data.map((r, i) => (
          <li key={r.key}>
            <button type="button" disabled={!onSelect} onClick={() => onSelect?.(r.key)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left enabled:hover:bg-accent/40">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="tabular-nums"><strong>{r.count}</strong><span className="text-muted-foreground"> · {Math.round((r.count / total) * 100)}%</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Committed / intended versus reconciled funded, one bar pair per fund. */
export function CapitalByFundChart({ data, empty = "No investment amounts recorded yet." }: { data: { name: string; committedCents: number; fundedCents: number }[]; empty?: string }) {
  const rows = data.filter((d) => d.committedCents || d.fundedCents).slice(0, 12)
    .map((d) => ({ name: d.name.length > 18 ? `${d.name.slice(0, 17)}…` : d.name, committed: d.committedCents / 100, funded: d.fundedCents / 100 }));
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  const config = { committed: { label: "Committed", color: "var(--chart-2)" }, funded: { label: "Reconciled funded", color: "var(--primary)" } };
  const fmt = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${v}`);
  return (
    <>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(160, rows.length * 44) }}>
        <BarChart data={rows} layout="vertical" accessibilityLayer margin={{ left: 8 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickFormatter={fmt} fontSize={11} />
          <YAxis type="category" dataKey="name" width={110} fontSize={11} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => `${config[n as keyof typeof config]?.label ?? n}: ${money(Number(v) * 100)}`} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="committed" fill="var(--color-committed)" radius={3} />
          <Bar dataKey="funded" fill="var(--color-funded)" radius={3} />
        </BarChart>
      </ChartContainer>
      <p className="sr-only">{rows.map((r) => `${r.name}: ${fmt(r.committed)} committed, ${fmt(r.funded)} funded`).join("; ")}</p>
    </>
  );
}
