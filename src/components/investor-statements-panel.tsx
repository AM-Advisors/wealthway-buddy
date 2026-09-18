import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMyCapitalStatements } from "@/lib/allocations.functions";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : `${Number(cents) < 0 ? "−" : ""}$${Math.abs(Number(cents) / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

/** The investor's own capital account statements, one per account they hold. */
export function InvestorStatementsPanel() {
  const load = useServerFn(listMyCapitalStatements);
  const { data, isLoading } = useQuery({
    queryKey: ["my-capital-statements"],
    queryFn: () => load(),
  });

  const statements = (data?.statements ?? []) as any[];
  const positions = (data?.positions ?? []) as any[];

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (statements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Your capital account statements will appear here once each period is closed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {statements.map((statement) => {
        const snapshot = statement.snapshot ?? {};
        const position = positions.find((p) => p.id === statement.position_id);
        return (
          <Card key={statement.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {snapshot.fundName ?? "Fund"} · {statement.period_start} to{" "}
                    {statement.period_end}
                  </CardTitle>
                  <CardDescription>
                    {snapshot.investorName ?? position?.display_name ?? "Investor"}
                    {position?.capacity ? ` · ${position.capacity.replace("_", " ")}` : ""}
                  </CardDescription>
                </div>
                <Badge variant={statement.status === "published" ? "secondary" : "outline"}>
                  {statement.status === "published" ? "Current" : "Replaced"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Line label="Opening capital" value={money(snapshot.beginningCapitalCents)} />
              <Line label="Capital contributed" value={money(snapshot.contributionsCents)} />
              <Line label="Income allocated" value={money(snapshot.netInvestmentIncomeCents)} />
              <Line label="Gains allocated" value={money(
                Number(snapshot.realizedGainCents ?? 0) + Number(snapshot.unrealizedGainCents ?? 0),
              )} />
              <Line label="Management fees" value={money(-Number(snapshot.managementFeesCents ?? 0))} />
              <Line label="Fund expenses" value={money(-Number(snapshot.fundExpensesCents ?? 0))} />
              <Line label="Distributions" value={money(-Number(snapshot.distributionsCents ?? 0))} />
              <Line label="Closing capital" value={money(snapshot.endingCapitalCents)} strong />
              <Line label="Commitment" value={money(snapshot.commitmentCents)} />
              <Line label="Unfunded commitment" value={money(snapshot.unfundedCommitmentCents)} />
              <p className="pt-3 text-xs text-muted-foreground">
                Produced from the fund's records for this period. Not a valuation, audit or tax
                document.
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
