import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CapitalStatementPanel } from "@/components/capital-statement-panel";
import { getMyCapitalSummary } from "@/lib/investor-capital.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const pct = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;

const units = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 4 });

const day = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold break-words">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground break-words">{hint}</p> : null}
    </div>
  );
}

/**
 * The investor's own capital account for each fund they are in: what they
 * committed, what the fund has received, the units recorded for them and what
 * has been distributed. Compact mode is the summary shown on the dashboard.
 */
export function InvestorCapitalSummary({ compact = false }: { compact?: boolean }) {
  const load = useServerFn(getMyCapitalSummary);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["my-capital-summary"],
    queryFn: () => load(),
    retry: false,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your capital…</p>;
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load your capital summary."}
      </p>
    );
  }

  const funds = data ?? [];
  if (!funds.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Once your subscription is closed, your commitment, contributions, units and distributions
        appear here.
      </p>
    );
  }

  const totals = funds.reduce(
    (sum, fund) => ({
      commitment: sum.commitment + fund.commitmentCents,
      contributed: sum.contributed + fund.contributedCents,
      outstanding: sum.outstanding + fund.outstandingCents,
      distributions: sum.distributions + (fund.myDistributionsCents ?? 0),
    }),
    { commitment: 0, contributed: 0, outstanding: 0, distributions: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Committed</CardDescription>
            <CardTitle className="text-xl">{money(totals.commitment)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Capital contributed</CardDescription>
            <CardTitle className="text-xl">{money(totals.contributed)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Still to fund</CardDescription>
            <CardTitle className="text-xl">{money(totals.outstanding)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Distributions to you</CardDescription>
            <CardTitle className="text-xl">{money(totals.distributions)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {funds.map((fund) => (
        <Card key={fund.applicationId}>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base break-words">{fund.fundName}</CardTitle>
              <CardDescription className="break-words">
                {fund.legalEntityName ? `${fund.legalEntityName} · ` : ""}
                {fund.closingDate ? `Closed ${day(fund.closingDate)}` : "Not yet closed"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {fund.regType ? <Badge variant="outline">{fund.regType}</Badge> : null}
              <Badge variant="secondary">{fund.status.replace(/_/g, " ")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Figure label="Commitment" value={money(fund.commitmentCents)} />
              <Figure
                label="Capital contributed"
                value={money(fund.contributedCents)}
                hint={
                  fund.outstandingCents > 0
                    ? `${money(fund.outstandingCents)} still to fund`
                    : "Fully funded"
                }
              />
              <Figure
                label="Units"
                value={units(fund.shares)}
                hint={
                  fund.shareClass
                    ? `${fund.shareClass}${fund.ownershipPct !== null ? ` · ${pct(fund.ownershipPct)}` : ""}`
                    : fund.ownershipPct !== null
                      ? pct(fund.ownershipPct)
                      : undefined
                }
              />
              <Figure
                label="Distributions to you"
                value={money(fund.myDistributionsCents)}
                hint={
                  fund.fundDistributionsCents > 0
                    ? `Fund total ${money(fund.fundDistributionsCents)}`
                    : "None recorded"
                }
              />
            </div>

            {!compact ? (
              <>
                {fund.valuation ? (
                  <p className="text-sm text-muted-foreground">
                    Fund value {money(fund.valuation.navCents)} as at {day(fund.valuation.asOf)}
                    {fund.valuation.myShareCents !== null
                      ? ` · your share ${money(fund.valuation.myShareCents)}`
                      : ""}
                    .
                  </p>
                ) : null}

                {fund.distributions.length ? (
                  <div className="space-y-2">
                    <Separator />
                    <p className="text-sm font-medium">Distributions</p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-sm">
                        <thead className="text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="py-1 pr-4">Date</th>
                            <th className="py-1 pr-4">Type</th>
                            <th className="py-1 pr-4">Fund amount</th>
                            <th className="py-1">Your share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fund.distributions.map((row, index) => (
                            <tr key={`${fund.applicationId}-${index}`} className="border-t">
                              <td className="py-1 pr-4">{day(row.date)}</td>
                              <td className="py-1 pr-4">
                                {row.kind ? row.kind.replace(/_/g, " ") : "Distribution"}
                              </td>
                              <td className="py-1 pr-4">{money(row.amountCents)}</td>
                              <td className="py-1">{money(row.myShareCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Capital account statements</p>
                  <CapitalStatementPanel applicationId={fund.applicationId} />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {!compact ? (
        <p className="text-xs text-muted-foreground">
          These figures come from the fund's own records, kept by Harmonious as administrator. They
          are not a valuation, audit, tax return or investment advice.
        </p>
      ) : null}
    </div>
  );
}
