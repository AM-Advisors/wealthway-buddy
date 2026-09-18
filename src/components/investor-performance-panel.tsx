import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvestorPerformance } from "@/lib/performance-reporting.functions";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : `${Number(cents) < 0 ? "−" : ""}$${Math.abs(Number(cents) / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const pct = (bps: number | null | undefined) =>
  bps === null || bps === undefined ? "—" : `${(Number(bps) / 100).toFixed(2)}%`;

const times = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}×`;

const label = (value: string) => String(value ?? "").replaceAll("_", " ");

function Figure({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

export function InvestorPerformancePanel() {
  const load = useServerFn(getInvestorPerformance);
  const query = useQuery({
    queryKey: ["investor-performance"],
    queryFn: async (): Promise<any> => load({ data: {} }),
  });

  const investments = query.data?.investments ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Performance</h1>
        <p className="text-sm text-muted-foreground">
          How each of your investments has performed. Figures shown under “Your investment” are
          calculated from your own contributions, distributions and capital — they are not the same
          as the fund-level figures shown alongside them.
        </p>
      </div>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {!query.isLoading && investments.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No performance has been published for your investments yet.
          </CardContent>
        </Card>
      ) : null}

      {investments.map((investment: any) => (
        <Card key={`${investment.offeringId}:${investment.positionId}`}>
          <CardHeader>
            <CardTitle className="text-base">{investment.fundName}</CardTitle>
            <CardDescription>
              {investment.displayName} · held as {label(investment.capacity)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {investment.periods.map((period: any) => (
              <div key={period.runId} className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{period.periodLabel}</p>
                  <Badge className="bg-muted text-muted-foreground">{label(period.periodKind)}</Badge>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Your investment
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Figure title="Contributed" value={money(period.yourInvestment.contributedCents)} />
                    <Figure title="Current value" value={money(period.yourInvestment.currentValueCents)} />
                    <Figure title="Distributions" value={money(period.yourInvestment.distributionsCents)} />
                    <Figure title="Total value" value={money(period.yourInvestment.totalValueCents)} />
                    <Figure title="Gain / loss" value={money(period.yourInvestment.gainCents)} />
                    <Figure
                      title="Your IRR"
                      value={
                        period.yourInvestment.irrStatus === "solved"
                          ? pct(period.yourInvestment.irrBps)
                          : "Not available"
                      }
                    />
                    <Figure title="Your MOIC" value={times(period.yourInvestment.moic)} />
                    <Figure title="Period return" value={pct(period.yourInvestment.netReturnBps)} />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Fund level (all investors)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Figure title="Fund net assets" value={money(period.fundLevel.netAssetsCents)} />
                    <Figure title="Fund return" value={pct(period.fundLevel.netReturnBps)} />
                    <Figure
                      title="Fund IRR"
                      value={
                        period.fundLevel.irrStatus === "solved" ? pct(period.fundLevel.irrBps) : "Not available"
                      }
                    />
                    <Figure title="Fund MOIC" value={times(period.fundLevel.moic)} />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
