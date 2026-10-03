import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Bar, BarChart, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CHANNEL_LABEL, STAGE_LABEL, type PeriodKey } from "@/lib/sales-model";

export type PeriodValue = { period: PeriodKey; from?: string; to?: string };
export const money = (c: number | null | undefined) => (c == null ? "-" : `$${(Number(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
export const pct = (n: number | null | undefined) => (n == null ? "-" : `${Math.round(n * 100)}%`);
export const channelLabel = (k: string) => (CHANNEL_LABEL as Record<string, string>)[k] ?? k;
export const stageLabel = (k: string) => (STAGE_LABEL as Record<string, string>)[k] ?? k;
export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)", "var(--muted-foreground)"];

export function usePeriod(initial: PeriodKey = "month") {
  return useState<PeriodValue>({ period: initial });
}

export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" variant="outline" size="sm" value={value.period} onValueChange={(p) => p && onChange({ ...value, period: p as PeriodKey })}>
        {(["day", "week", "month", "quarter", "year", "custom"] as const).map((p) => (
          <ToggleGroupItem key={p} value={p} className="capitalize">{p}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      {value.period === "custom" && (
        <>
          <Input type="date" aria-label="From" className="h-8 w-40" value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <Input type="date" aria-label="To" className="h-8 w-40" value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

export function Stat({ label, value, hint, onClick }: { label: string; value: string | number; hint?: string; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className={`rounded-lg border bg-card p-4 text-left ${onClick ? "transition hover:border-primary" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </C>
  );
}

export function Donut({ data, onSelect, center }: { data: { name: string; value: number; key?: string }[]; onSelect?: (key: string) => void; center?: string }) {
  const has = data.some((d) => d.value > 0);
  if (!has) return <p className="py-10 text-center text-sm text-muted-foreground">Nothing in this period yet.</p>;
  return (
    <div className="relative h-56">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} onClick={(d: any) => onSelect?.(d.key ?? d.name)} className={onSelect ? "cursor-pointer" : ""}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-semibold text-foreground">{center}</div>}
    </div>
  );
}

export function Bars({ data, onSelect, money: isMoney }: { data: { name: string; value: number; key?: string }[]; onSelect?: (key: string) => void; money?: boolean }) {
  if (!data.some((d) => d.value > 0)) return <p className="py-10 text-center text-sm text-muted-foreground">Nothing in this period yet.</p>;
  return (
    <div className="h-60">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={120} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <Tooltip formatter={(v: any) => (isMoney ? money(v) : v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} onClick={(d: any) => onSelect?.(d.key ?? d.name)} className={onSelect ? "cursor-pointer" : ""}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-semibold text-foreground">{title}</h2>{action}</div>
      {children}
    </section>
  );
}
