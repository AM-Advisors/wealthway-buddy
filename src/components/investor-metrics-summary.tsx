import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { opsFundsDashboardFn } from "@/lib/ops-funds.functions";

/**
 * Cross-fund investor counts for Operations → Investors. Read-only; reuses the
 * Funds dashboard reader (same cache and readiness summaries), excluding demo funds.
 */
export function InvestorMetricsSummary() {
  const load = useServerFn(opsFundsDashboardFn);
  const q = useQuery({ queryKey: ["ops-funds-dashboard"], queryFn: () => load(), retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  const i = (q.data as any)?.totals?.investors;
  if (q.isError || !i) return null;
  const cards: [string, number, boolean][] = [
    ["Investments", i.total, false],
    ["In onboarding", i.onboarding, false],
    ["Ready to close", i.ready, false],
    ["Needs Harmonious", i.needsHarmonious, false],
    ["Blocked", i.blocked, true],
  ];
  return (
    <div className="px-6 pt-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
        {cards.map(([label, value, warn]) => (
          <div key={label} className="bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`font-heading text-2xl font-semibold ${warn && value ? "text-destructive" : ""}`}>{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Counts each investment across all real funds, including investors who haven't signed in yet.</p>
    </div>
  );
}
