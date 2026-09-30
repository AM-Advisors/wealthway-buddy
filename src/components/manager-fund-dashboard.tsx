import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { BarList, CapitalBars, ChartCard, DonutChart, EmptyState, Kpi, KpiSkeleton, TrendChart } from "@/components/dashboard-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { managerFundDashboardFn } from "@/lib/dashboards.functions";
import { METRIC_DEFINITIONS } from "@/lib/dashboard-metrics";

export function ManagerFundDashboard({ fundId }: { fundId: string }) {
  const load = useServerFn(managerFundDashboardFn);
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["manager-fund-dashboard", fundId], queryFn: () => load({ data: { offeringId: fundId, range: "90d" } }), retry: false });
  const roster = (search: { stage?: string; bucket?: string }) => navigate({ to: "/manager/fund/$fundId/investors", params: { fundId }, search: search as any });
  const d = q.data;
  if (q.isError) return <EmptyState>Fund dashboard is unavailable right now.</EmptyState>;

  return (
    <section className="space-y-4" aria-label="Fund dashboard">
      <Card className="border-primary/40">
        <CardHeader className="pb-2"><CardTitle className="text-lg">Needs Your Attention</CardTitle></CardHeader>
        <CardContent>
          {q.isPending ? <Skeleton className="h-16" /> : d && d.needsMe.length ? (
            <ul className="space-y-2">{d.needsMe.map((n: any) => (
              <li key={n.onboardingId} className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-medium">{n.name}</p><p className="text-sm text-muted-foreground">{n.action}</p></div>
                <Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: n.onboardingId }} className="text-sm font-medium text-primary hover:underline">Open</Link>
              </li>
            ))}</ul>
          ) : <div><p className="font-medium">You're caught up</p><p className="text-sm text-muted-foreground">There are no Fund Manager actions waiting on you.</p></div>}
        </CardContent>
      </Card>

      {q.isPending ? <KpiSkeleton /> : d ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Investors" value={d.kpis.investors} onClick={() => roster({})} />
          <Kpi label="Onboarding" value={d.kpis.onboarding} definition={METRIC_DEFINITIONS.onboarding} onClick={() => roster({})} />
          <Kpi label="Needs Investor" value={d.kpis.needsInvestor} onClick={() => roster({ bucket: "needs_investor" })} />
          <Kpi label="Needs Me" value={d.kpis.needsMe} onClick={() => roster({ bucket: "needs_me" })} />
          <Kpi label="Ready" value={d.kpis.ready} definition={METRIC_DEFINITIONS.ready} onClick={() => roster({ bucket: "ready" })} />
          <Kpi label="Funded" value={d.kpis.funded} definition={METRIC_DEFINITIONS.funded} onClick={() => roster({ stage: "complete" })} />
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <ChartCard title="Onboarding funnel" description="Tap a stage to see those investors.">
          {q.isPending ? <Skeleton className="h-40" /> : d ? <BarList ariaLabel="Onboarding funnel" rows={d.funnel} empty="No investors yet. Share the onboarding link to begin." onSelect={(k) => k !== "invited" && roster({ stage: k })} /> : null}
        </ChartCard>
        <ChartCard title="Investor readiness" description="Who each active investment is waiting on.">
          {q.isPending ? <Skeleton className="h-40" /> : d ? <DonutChart ariaLabel="Investor readiness" rows={d.readiness} empty="No active investments yet." onSelect={(k) => roster({ bucket: k })} /> : null}
        </ChartCard>
        <ChartCard title="Capital progress" description="Intended amounts versus reconciled funded capital.">
          {q.isPending ? <Skeleton className="h-32" /> : d ? <CapitalBars intended={d.capital.intendedCents} funded={d.capital.fundedCents} target={d.capital.targetCents} definitions={METRIC_DEFINITIONS} /> : null}
        </ChartCard>
      </div>

      <ChartCard title="Onboarding over time" description="Investors who started, and investments funded, in the last 90 days.">
        {q.isPending ? <Skeleton className="h-52" /> : d ? <TrendChart data={d.trend} /> : null}
      </ChartCard>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recent Investor Activity</CardTitle><CardDescription>Milestones only.</CardDescription></CardHeader>
        <CardContent>
          {q.isPending ? <Skeleton className="h-24" /> : d && d.activity.length ? (
            <ul className="divide-y text-sm">{d.activity.map((a: any, i: number) => (
              <li key={i} className="flex justify-between gap-2 py-1.5"><span className="min-w-0 truncate"><strong>{a.name}</strong> · {a.label}</span><span className="shrink-0 text-xs text-muted-foreground">{new Date(a.at).toLocaleDateString()}</span></li>
            ))}</ul>
          ) : <EmptyState>No investor activity recorded yet.</EmptyState>}
        </CardContent>
      </Card>
    </section>
  );
}
