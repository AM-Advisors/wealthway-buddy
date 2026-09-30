import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { CapitalByFundChart, ChartCard, DonutChart } from "@/components/dashboard-charts";
import { getSalesPerformance } from "@/lib/sales-performance.functions";
import { COMMERCIAL_STATUS_LABEL } from "@/lib/commercial-pricing";

const money = (c: number | null | undefined) => (c == null ? "—" : `$${(Number(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const STAGE_LABEL = { invited: "Invited", started: "Onboarding", signed: "Signed", funded: "Funded" } as const;

export function SalesOverviewTab() {
  const load = useServerFn(getSalesPerformance);
  const q = useQuery({ queryKey: ["sales-performance"], queryFn: () => load(), retry: false });
  if (q.error) return <p className="py-4 text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;
  const d = q.data;
  return (
    <div className="space-y-8 pt-4">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Funds" value={String(d.totals.funds)} />
        <Stat label="Committed" value={money(d.totals.committedCents)} />
        <Stat label="Funded (reconciled)" value={money(d.totals.fundedCents)} />
        <Stat label="Harmonious fees" value={money(d.totals.feeCents)} />
        <Stat label="Discounts awaiting approval" value={String(d.totals.pendingApprovals)} />
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        <ChartCard title="Capital raised by fund" description="Committed versus reconciled funded.">
          <CapitalByFundChart data={d.performance} />
        </ChartCard>
        <ChartCard title="Investor pipeline" description="Investors by stage.">
          <DonutChart ariaLabel="Pipeline by stage" empty="No investors in the pipeline yet."
            rows={(Object.keys(STAGE_LABEL) as (keyof typeof STAGE_LABEL)[]).map((k) => ({ key: k, label: STAGE_LABEL[k], count: d.stages[k], percent: null }))} />
        </ChartCard>
      </section>

      <section>
        <h2 className="text-lg">Fund performance</h2>
        <p className="mb-2 text-xs text-muted-foreground">Capital raised and commercial terms. Funded counts only money we have reconciled.</p>
        {d.performance.length === 0 ? <Empty text="No funds yet." /> : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Fund</th><th className="p-2">Investors</th><th className="p-2 text-right">Committed</th><th className="p-2 text-right">Funded</th><th className="p-2 text-right">Fees</th><th className="p-2">Pricing</th></tr>
              </thead>
              <tbody className="divide-y">
                {d.performance.map((f) => (
                  <tr key={f.id}>
                    <td className="p-2">{f.name}<div className="text-xs text-muted-foreground">{f.clientName ?? "No client"}</div></td>
                    <td className="p-2">{f.investors}{f.fundedInvestors ? <span className="text-xs text-muted-foreground"> · {f.fundedInvestors} funded</span> : null}</td>
                    <td className="p-2 text-right">{money(f.committedCents)}</td>
                    <td className="p-2 text-right">{money(f.fundedCents)}</td>
                    <td className="p-2 text-right">{money(f.feeCents)}</td>
                    <td className="p-2"><Badge variant="outline">{COMMERCIAL_STATUS_LABEL[f.pricingStatus as keyof typeof COMMERCIAL_STATUS_LABEL] ?? f.pricingStatus}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg">Investor pipeline</h2>
          <div className="my-2 flex flex-wrap gap-2 text-xs">
            {(Object.keys(STAGE_LABEL) as (keyof typeof STAGE_LABEL)[]).map((s) => <Badge key={s} variant="secondary">{STAGE_LABEL[s]}: {d.stages[s]}</Badge>)}
          </div>
          {d.pipeline.length === 0 ? <Empty text="No investors in the pipeline yet." /> : (
            <ul className="divide-y rounded-md border text-sm">
              {d.pipeline.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 p-2">
                  <span>{p.name}<span className="block text-xs text-muted-foreground">{p.fundName} · {money(p.amountCents)}</span></span>
                  <Badge variant={p.stage === "funded" ? "default" : "outline"}>{STAGE_LABEL[p.stage]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="text-lg">Recent sales activity</h2>
          {d.activity.length === 0 ? <Empty text="No activity yet." /> : (
            <ul className="mt-2 divide-y rounded-md border text-sm">
              {d.activity.map((a, i) => (
                <li key={i} className="flex justify-between gap-3 p-2"><span>{a.text}</span><span className="shrink-0 text-xs text-muted-foreground">{new Date(a.at).toLocaleDateString("en-US")}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl">{value}</div></div>;
}
function Empty({ text }: { text: string }) { return <p className="py-4 text-sm text-muted-foreground">{text}</p>; }
