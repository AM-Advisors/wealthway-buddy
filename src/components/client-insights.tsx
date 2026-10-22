import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, Wallet, Landmark, Coins } from "lucide-react";

import { bucketize, byService, filterFacts, totals, PERIODS, PERIOD_LABEL, type Fact, type Period } from "@/lib/client-dashboard-model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const short = (v: number) => { const d = v / 100; return Math.abs(d) >= 1e6 ? `$${(d / 1e6).toFixed(1)}M` : Math.abs(d) >= 1e3 ? `$${(d / 1e3).toFixed(0)}K` : `$${d.toFixed(0)}`; };
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }, formatter: (v: number) => money(v) };

export type InsightFilters = { period: Period; fundId: string | null; service: string | null };

export function InsightFilterBar({ funds, services, value, onChange }: { funds: { id: string; name: string }[]; services: string[]; value: InsightFilters; onChange: (v: InsightFilters) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex rounded-md border p-0.5">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => onChange({ ...value, period: p })}
            className={`rounded px-2.5 py-1 text-xs font-medium ${value.period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{PERIOD_LABEL[p]}</button>
        ))}
      </div>
      <Select value={value.fundId ?? "all"} onValueChange={(v) => onChange({ ...value, fundId: v === "all" ? null : v })}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">All funds</SelectItem>{funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={value.service ?? "all"} onValueChange={(v) => onChange({ ...value, service: v === "all" ? null : v })}>
        <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">All services</SelectItem>{services.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function useInsights(facts: Fact[], f: InsightFilters) {
  return useMemo(() => {
    const scoped = filterFacts(facts, f);
    return { buckets: bucketize(scoped, f.period), total: totals(scoped), services: byService(scoped), deals: bucketize(scoped, "deal") };
  }, [facts, f.period, f.fundId, f.service]);
}

function Tile({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: string; hint: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-accent/20 p-2 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="font-heading text-xl font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{hint}</p></div>
      </CardContent>
    </Card>
  );
}

export function SummaryTiles({ total }: { total: ReturnType<typeof totals> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile icon={Wallet} label="Harmonious costs" value={money(total.costInvoiced)} hint={`${money(total.costPaid)} paid`} />
      <Tile icon={Landmark} label="Capital raised" value={money(total.committed)} hint={`${money(total.funded)} funded`} />
      <Tile icon={Coins} label="Fees and carry earned" value={money(total.earned)} hint={`${money(total.fees)} fees · ${money(total.carry)} carry`} />
      <Tile icon={TrendingUp} label="Net after Harmonious costs" value={money(total.net)} hint="Summary, not accounting statements" />
    </div>
  );
}

export function InsightCharts({ buckets }: { buckets: ReturnType<typeof bucketize> }) {
  if (!buckets.length) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No invoices, capital or recorded fees yet for this selection.</CardContent></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Earned vs. Harmonious costs</CardTitle><CardDescription>Management fees and carry recorded in the fund books, against invoiced services. Carry appears only once recorded.</CardDescription></CardHeader>
        <CardContent className="h-64 overflow-x-auto"><ResponsiveContainer width="100%" height="100%" minWidth={360}>
          <BarChart data={buckets}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" fontSize={11} /><YAxis tickFormatter={short} fontSize={11} width={56} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="fees" name="Management fees" stackId="e" fill="var(--primary)" /><Bar dataKey="carry" name="Carry" stackId="e" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="costInvoiced" name="Harmonious costs" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} /></BarChart>
        </ResponsiveContainer></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Capital raised</CardTitle><CardDescription>Committed and funded investor capital.</CardDescription></CardHeader>
        <CardContent className="h-64 overflow-x-auto"><ResponsiveContainer width="100%" height="100%" minWidth={360}>
          <LineChart data={buckets}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" fontSize={11} /><YAxis tickFormatter={short} fontSize={11} width={56} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="committed" name="Committed" stroke="var(--primary)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="funded" name="Funded" stroke="var(--accent)" strokeWidth={2} dot={false} /></LineChart>
        </ResponsiveContainer></CardContent>
      </Card>
    </div>
  );
}

export function ServiceCosts({ rows }: { rows: ReturnType<typeof byService> }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Costs by service</CardTitle><CardDescription>What Harmonious has invoiced and you've paid, per service.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {!rows.length && <p className="text-sm text-muted-foreground">No invoiced services yet.</p>}
        {rows.map((r) => { const max = rows[0]?.invoiced || 1; return (
          <div key={r.service}>
            <div className="flex justify-between text-sm"><span>{r.service}</span><span className="font-medium">{money(r.invoiced)}</span></div>
            <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (r.invoiced / max) * 100)}%` }} /></div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{money(r.paid)} paid</p>
          </div>); })}
      </CardContent>
    </Card>
  );
}

export function FundComparison({ deals }: { deals: ReturnType<typeof bucketize> }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">By fund / deal</CardTitle><CardDescription>Each figure shown separately; net = fees and carry earned minus Harmonious costs.</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto">
        {!deals.length ? <p className="text-sm text-muted-foreground">No fund activity yet.</p> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Fund</th><th className="text-right">Raised</th><th className="text-right">Funded</th><th className="text-right">Fees</th><th className="text-right">Carry</th><th className="text-right">Harmonious costs</th><th className="text-right">Net</th></tr></thead>
            <tbody>{deals.map((d) => (
              <tr key={d.key} className="border-b last:border-0"><td className="py-2 font-medium">{d.label}</td><td className="text-right">{money(d.committed)}</td><td className="text-right">{money(d.funded)}</td><td className="text-right">{money(d.fees)}</td><td className="text-right">{money(d.carry)}</td><td className="text-right">{money(d.costInvoiced)}</td>
                <td className={`text-right font-semibold ${d.net < 0 ? "text-destructive" : ""}`}>{money(d.net)}</td></tr>))}</tbody>
          </table>)}
      </CardContent>
    </Card>
  );
}
