import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { fundReadinessFn } from "@/lib/investor-onboarding.functions";
import { rosterSummary } from "@/lib/ops-funds-model";

/** Totals for the Investors tab, from the canonical readiness engine (same data as the Readiness tab). */
export function FundRosterSummary({ fundId }: { fundId: string }) {
  const load = useServerFn(fundReadinessFn);
  const q = useQuery({ queryKey: ["fund-readiness", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  if (!q.data) return null;
  const s = rosterSummary((q.data as any).rows);
  const cells: [string, number][] = [["Total Investors", s.total], ["Onboarding", s.onboarding], ["Ready", s.ready], ["Needs Attention", s.needsAttention], ["Funded", s.funded]];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
        {cells.map(([l, v]) => (
          <div key={l} className="bg-card p-4 last:col-span-2 sm:last:col-span-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">{l}</p><p className="font-heading text-2xl font-semibold">{v}</p></div>
        ))}
      </div>
      <Link to="/manager/fund/$fundId/readiness" params={{ fundId }} className="text-xs text-primary underline">See readiness, next action and owner for each investor</Link>
    </div>
  );
}
