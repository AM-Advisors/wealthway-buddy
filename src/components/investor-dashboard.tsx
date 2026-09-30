import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";

import { CapitalByFundChart, Kpi } from "@/components/dashboard-charts";
import { InvitedFunds } from "@/components/investor-document-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { investorDashboardFn } from "@/lib/dashboards.functions";
import { CLIENT_STEPS, FUNDING_STATE_LABELS, type FundingState } from "@/lib/dashboard-metrics";
import { money } from "@/lib/status";

const WAITING: Record<string, string> = { harmonious: "Harmonious is reviewing — nothing needed from you right now.", fund_manager: "Waiting on the fund manager — nothing needed from you right now." };

function Steps({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Your progress">
      {CLIENT_STEPS.map((s, i) => {
        const done = i < step, current = i === step;
        return (
          <li key={s} className="text-center" aria-current={current ? "step" : undefined}>
            <div className={`h-1.5 rounded ${done || current ? "bg-primary" : "bg-muted"}`} />
            <p className={`mt-1 text-xs ${current ? "font-semibold" : "text-muted-foreground"}`}>{done ? <Check className="mr-0.5 inline h-3 w-3" aria-hidden /> : null}{s}{done ? <span className="sr-only"> (done)</span> : current ? <span className="sr-only"> (current)</span> : null}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** Investor home: next action first. Renders nothing when the person has no investments. */
export function InvestorDashboard() {
  const load = useServerFn(investorDashboardFn);
  const q = useQuery({ queryKey: ["investor-dashboard"], queryFn: () => load(), retry: false });
  if (q.isPending) return <Skeleton className="h-40 rounded-xl" />;
  const d = q.data;
  if (q.isError || !d || !d.investments.length) return <InvitedFunds />;
  const p = d.primary!;

  return (
    <section className="space-y-4" aria-label="Your investments">
      <InvitedFunds />
      <Card className="border-primary/50">
        <CardHeader className="pb-2"><CardDescription>Next action · {p.fundName}</CardDescription>
          <CardTitle className="text-xl">{p.nextAction ?? (p.complete ? "You're all set" : "You're caught up")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!p.nextAction && !p.complete && p.waitingOn ? <p className="text-sm text-muted-foreground">{WAITING[p.waitingOn] ?? ""}</p> : null}
          {p.nextAction ? <Button asChild size="lg"><Link to="/investment/$onboardingId" params={{ onboardingId: p.id }}>Continue</Link></Button> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Your Investment</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Fund</dt><dd className="font-medium">{p.fundName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Investing profile</dt><dd className="font-medium">{p.profileLabel ?? "Not chosen yet"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="font-medium">{p.amountCents ? money(p.amountCents) : "Not set yet"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Funding</dt><dd><Badge variant={p.fundingState === "funded" ? "default" : "outline"}>{FUNDING_STATE_LABELS[p.fundingState as FundingState]}</Badge></dd></div>
          </dl>
          <Steps step={p.step} />
        </CardContent>
      </Card>

      {d.investments.length > 1 ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Your portfolio</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Investments" value={d.summary.investments} /><Kpi label="In Progress" value={d.summary.inProgress} />
              <Kpi label="Funded" value={d.summary.funded} /><Kpi label="Needs Your Attention" value={d.summary.needsAttention} />
            </div>
            <CapitalByFundChart data={Object.values(d.investments.reduce((acc: Record<string, { name: string; committedCents: number; fundedCents: number }>, i: any) => {
              const a = (acc[i.fundName] ??= { name: i.fundName, committedCents: 0, fundedCents: 0 });
              a.committedCents += Number(i.amountCents ?? 0); if (i.funded) a.fundedCents += Number(i.amountCents ?? 0);
              return acc;
            }, {}))} empty="Amounts will appear once you set them." />
            <ul className="space-y-2">{d.investments.map((i: any) => (
              <li key={i.id}><Link to="/investment/$onboardingId" params={{ onboardingId: i.id }} className="flex flex-col gap-1 rounded-md border p-3 hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between">
                <span><strong>{i.fundName}</strong><span className="block text-xs text-muted-foreground">{i.profileLabel ?? "Profile not chosen"} · {i.amountCents ? money(i.amountCents) : "Amount not set"}</span></span>
                <span className="text-sm">{i.complete ? "Complete" : CLIENT_STEPS[Math.min(i.step, 3)]} · {FUNDING_STATE_LABELS[i.fundingState as FundingState]}{i.nextAction ? <span className="block text-xs font-medium text-primary">{i.nextAction}</span> : null}</span>
              </Link></li>
            ))}</ul>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
