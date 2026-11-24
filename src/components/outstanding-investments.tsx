import { Link } from "@tanstack/react-router";
import { useInvestorDashboard } from "@/components/investor-dashboard";
import { InvestmentTaskList } from "@/components/investment-task-list";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/load-error";

export function OutstandingInvestments({ enabled }: { enabled: boolean }) {
  const q = useInvestorDashboard(false, enabled);
  if (!enabled) return null;
  if (q.isError) return <LoadError audience="account" what="Your investment tasks" error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading investment tasks…</p>;
  const investments = q.data?.investments.filter((i) => i.outstandingTasks?.length) ?? [];
  if (!investments.length) return null;
  return <section className="space-y-6" aria-label="Outstanding tasks"><h2 className="text-xl font-semibold">Outstanding tasks</h2>
    {investments.map((i) => <div key={i.id} className="space-y-2"><h3 className="text-lg font-semibold">{i.fundName}</h3>
      <InvestmentTaskList tasks={i.outstandingTasks ?? []} />
      <Button asChild variant="outline"><Link to="/investment/$onboardingId" params={{ onboardingId: i.id }}>{i.nextAction ? "Continue investment" : "View progress"}</Link></Button>
    </div>)}
  </section>;
}