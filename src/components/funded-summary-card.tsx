import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { METRIC_DEFINITIONS, type FundedSummary } from "@/lib/dashboard-metrics";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Closed (funded) versus still-pending investments, counts and amounts. */
export function FundedSummaryCard({ summary }: { summary: FundedSummary | undefined | null }) {
  if (!summary) return null;
  const total = summary.closedCount + summary.pendingCount;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Funded investments</CardTitle>
        <CardDescription>
          {summary.closedCount} of {total} investors have closed their investment.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3" title={METRIC_DEFINITIONS.closedInvestments}>
          <p className="text-sm text-muted-foreground">Closed</p>
          <p className="text-2xl font-semibold">{summary.closedCount} investors</p>
          <p className="text-sm">{usd(summary.closedCents)}</p>
        </div>
        <div className="rounded-md border p-3" title={METRIC_DEFINITIONS.pendingInvestments}>
          <p className="text-sm text-muted-foreground">Still pending</p>
          <p className="text-2xl font-semibold">{summary.pendingCount} investors</p>
          <p className="text-sm">{usd(summary.pendingCents)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
