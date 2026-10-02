import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { BarList, CapitalBars, CapitalByFundChart, ChartCard, DonutChart, EmptyState, Kpi, KpiSkeleton, TrendChart } from "@/components/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { opsDashboardFn } from "@/lib/dashboards.functions";
import { METRIC_DEFINITIONS, type TrendRange } from "@/lib/dashboard-metrics";

const ANY = "__any";
const AGREEMENT_LABEL: Record<string, string> = { complete: "Complete", follow_up: "Follow-up required", needs_review: "Setup needs review" };
const OWNER_LABEL: Record<string, string> = { investor: "Investor", fund_manager: "Fund Manager", harmonious: "Harmonious" };

export function OpsDashboard() {
  const load = useServerFn(opsDashboardFn);
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(ANY);
  const [fundId, setFundId] = useState(ANY);
  const [range, setRange] = useState<TrendRange>("90d");
  const filters = { clientId: clientId === ANY ? undefined : clientId, fundId: fundId === ANY ? undefined : fundId, range };
  const q = useQuery({ queryKey: ["ops-dashboard", filters], queryFn: () => load({ data: filters }), retry: false });

  const toFunds = (filter: string) => navigate({ to: "/ops/funds", search: { filter: filter as any } });
  const toQueue = (owner: string) => navigate({ to: "/ops/readiness", search: { owner: owner as any } });

  const d = q.data;
  const attention = d ? [
    { label: "Needs Harmonious", n: d.attention.needsHarmonious, go: () => toQueue("harmonious") },
    { label: "Waiting on Investor", n: d.attention.waitingInvestor, go: () => toQueue("investor") },
    { label: "Waiting on Fund Manager", n: d.attention.waitingFundManager, go: () => toQueue("fund_manager") },
    { label: "Agreement Follow-Up", n: d.attention.agreementFollowUp, go: () => toFunds("agreement_follow_up") },
    { label: "Identity / Entity Review", n: d.attention.identityReview, go: () => toQueue("harmonious") },
    { label: "Related Person Review", n: d.attention.relatedPersonReview, go: () => navigate({ to: "/ops/funds", hash: "related-person-reviews" }) },
    { label: "Document / Signature Review", n: d.attention.documentReview, go: () => toQueue("harmonious") },
    { label: "Funding / Reconciliation", n: d.attention.fundingReconciliation, go: () => toQueue("harmonious") },
  ] : [];

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6" aria-label="Operations dashboard">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl">What needs Harmonious today</h1><p className="text-sm text-muted-foreground">Built from live readiness, onboarding, funding and agreement records.</p></div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setFundId(ANY); }}>
            <SelectTrigger className="sm:w-44" aria-label="Client"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent><SelectItem value={ANY}>All clients</SelectItem>{(d?.filterOptions.clients ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fundId} onValueChange={setFundId}>
            <SelectTrigger className="sm:w-44" aria-label="Fund"><SelectValue placeholder="All funds" /></SelectTrigger>
            <SelectContent><SelectItem value={ANY}>All funds</SelectItem>{(d?.filterOptions.funds ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {q.isError ? <EmptyState>Dashboard data is unavailable right now. The work queue below is unaffected.</EmptyState> : null}

      <Card className="border-primary/40">
        <CardHeader className="pb-2"><CardTitle className="text-lg">Needs Attention</CardTitle><CardDescription>Each count opens the queue or list where the work happens.</CardDescription></CardHeader>
        <CardContent>
          {q.isPending ? <KpiSkeleton n={8} /> : d ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {attention.map((a) => <Kpi key={a.label} label={a.label} value={a.n} onClick={a.go} />)}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {q.isPending ? <KpiSkeleton /> : d ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Active Funds / SPVs" value={d.kpis.activeFunds} onClick={() => toFunds("active")} />
          <Kpi label="Total Investors" value={d.kpis.investors} onClick={() => toFunds("all")} />
          <Kpi label="Onboarding" value={d.kpis.onboarding} definition={METRIC_DEFINITIONS.onboarding} onClick={() => toFunds("onboarding")} />
          <Kpi label="Ready to Fund/Close" value={d.kpis.ready} definition={METRIC_DEFINITIONS.ready} onClick={() => toFunds("ready")} />
          <Kpi label="Needs Harmonious" value={d.kpis.needsHarmonious} definition={METRIC_DEFINITIONS.needsHarmonious} onClick={() => toQueue("harmonious")} />
          <Kpi label="Funded" value={d.kpis.funded} definition={METRIC_DEFINITIONS.funded} />
        </div>
      ) : null}
      {d ? <p className="text-xs text-muted-foreground">Assets / capital administered isn't shown: there are no reconciled accounting balances to report it from yet.</p> : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <ChartCard title="Onboarding funnel" description="Where active investors are, as a share of all shown.">
          {q.isPending ? <Skeleton className="h-40" /> : d ? <BarList ariaLabel="Onboarding funnel" rows={d.funnel} empty="No investors are onboarding yet." onSelect={(k) => toFunds(k === "complete" ? "ready" : k === "invited" ? "all" : "onboarding")} /> : null}
        </ChartCard>
        <ChartCard title="Readiness" description="Active investments by what they are waiting on.">
          {q.isPending ? <Skeleton className="h-40" /> : d ? <DonutChart ariaLabel="Readiness distribution" rows={d.readiness} empty="No active investments yet." onSelect={(k) => k === "ready" ? toFunds("ready") : k === "blocked" ? toFunds("blocked") : toQueue(k === "needs_investor" ? "investor" : k === "needs_fund_manager" ? "fund_manager" : "harmonious")} /> : null}
        </ChartCard>
        <ChartCard title="Capital status" description="Intended amounts versus money reconciled to investments.">
          {q.isPending ? <Skeleton className="h-32" /> : d ? <CapitalBars intended={d.capital.intendedCents} awaiting={d.capital.awaitingFundingCents} funded={d.capital.fundedCents} definitions={METRIC_DEFINITIONS} /> : null}
        </ChartCard>
        <ChartCard title="Client agreements" description="Harmonious MSA/SOW status. Never affects investment readiness.">
          {q.isPending ? <Skeleton className="h-32" /> : d ? <BarList ariaLabel="Client agreements" empty="No clients in this view." onSelect={(k) => toFunds(k === "complete" ? "all" : "agreement_follow_up")}
            rows={[{ key: "complete", label: "Complete", count: d.agreements.complete, percent: null }, { key: "follow_up", label: "Follow-Up Required", count: d.agreements.follow_up, percent: null }, { key: "needs_review", label: "Setup Needs Review", count: d.agreements.needs_review, percent: null }]} /> : null}
        </ChartCard>
      </div>

      <ChartCard title="Capital by fund" description="Intended amounts versus money reconciled to investments, per fund.">
        {q.isPending ? <Skeleton className="h-52" /> : d ? <CapitalByFundChart data={d.funds} /> : null}
      </ChartCard>

      <ChartCard title="Investor onboarding" description="Onboardings started and investments funded, from recorded events only.">
        <div className="mb-2 flex gap-1" role="group" aria-label="Time range">
          {(["30d", "90d", "12m"] as TrendRange[]).map((r) => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={`rounded-md border px-2 py-1 text-xs ${range === r ? "bg-primary text-primary-foreground" : ""}`}>{r === "30d" ? "30 days" : r === "90d" ? "90 days" : "12 months"}</button>)}
        </div>
        {q.isPending ? <Skeleton className="h-52" /> : d ? <TrendChart data={d.trend} /> : null}
      </ChartCard>

      <ChartCard title="Fund health" description="Funds needing attention first. Open a fund to act.">
        {q.isPending ? <Skeleton className="h-40" /> : d && d.funds.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr>{["Fund", "Client", "Investors", "Onboarding", "Ready", "Needs Attention", "Funded", "Agreement", "Next Action"].map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
                <tbody>{d.funds.map((f: any) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-2 py-1.5"><Link to="/ops/funds/$fundId" params={{ fundId: f.id }} className="font-medium hover:underline">{f.name}</Link></td>
                    <td className="px-2 py-1.5">{f.clientName ?? "-"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{f.investors}</td><td className="px-2 py-1.5 tabular-nums">{f.onboarding}</td><td className="px-2 py-1.5 tabular-nums">{f.ready}</td>
                    <td className="px-2 py-1.5 tabular-nums">{f.needsAttention}</td><td className="px-2 py-1.5 tabular-nums">{f.funded}</td>
                    <td className="px-2 py-1.5"><Badge variant={f.agreement === "complete" ? "secondary" : "outline"}>{AGREEMENT_LABEL[f.agreement] ?? f.agreement}</Badge></td>
                    <td className="px-2 py-1.5">{f.nextAction ? `${f.nextAction.label}${f.nextAction.owner ? ` · ${OWNER_LABEL[f.nextAction.owner] ?? ""}` : ""}` : "-"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <ul className="space-y-2 md:hidden">{d.funds.map((f: any) => (
              <li key={f.id} className="rounded-md border p-3">
                <Link to="/ops/funds/$fundId" params={{ fundId: f.id }} className="font-medium hover:underline">{f.name}</Link>
                <p className="text-xs text-muted-foreground">{f.clientName ?? "No client"} · {AGREEMENT_LABEL[f.agreement]}</p>
                <p className="mt-1 text-sm">{f.investors} investors · {f.onboarding} onboarding · {f.ready} ready · {f.needsAttention} need attention · {f.funded} funded</p>
                {f.nextAction ? <p className="mt-1 text-xs">Next: {f.nextAction.label}</p> : null}
              </li>
            ))}</ul>
          </>
        ) : d ? <EmptyState>No funds in this view.</EmptyState> : null}
      </ChartCard>
    </section>
  );
}
