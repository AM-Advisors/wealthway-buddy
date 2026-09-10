import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listFundConditionExceptions } from "@/lib/fund-conditions.functions";

/** Funds that cannot take new investors or move money until Harmonious acts. */
export function FundConditionExceptions() {
  const load = useServerFn(listFundConditionExceptions);
  const exceptions = useQuery({
    queryKey: ["fund-condition-exceptions"],
    queryFn: () => load(),
    retry: false,
  });

  if (exceptions.isLoading)
    return <p className="text-sm text-muted-foreground">Checking every fund…</p>;
  if (exceptions.isError || !exceptions.data)
    return <p className="text-sm text-muted-foreground">This list isn't available.</p>;

  const rows = exceptions.data.rows;
  if (!rows.length)
    return (
      <p className="text-sm text-muted-foreground">
        Every fund has a recorded scope and meets the conditions in its agreement.
      </p>
    );

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{row.name}</CardTitle>
              {row.clientName ? <Badge variant="secondary">{row.clientName}</Badge> : null}
              {!row.configured ? <Badge variant="destructive">No scope recorded</Badge> : null}
              {row.blocking.length ? (
                <Badge variant="destructive">
                  {row.blocking.length} condition{row.blocking.length === 1 ? "" : "s"} open
                </Badge>
              ) : null}
              {row.feeNotice && !row.feeNotice.acknowledged ? (
                <Badge variant="outline">Fee threshold passed</Badge>
              ) : null}
            </div>
            <CardDescription>
              Onboarding and funding stay paused for this fund until these are handled.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {row.blocking.map((b) => (
              <p key={b.label}>
                <span className="font-medium">{b.label}:</span> {b.detail}
              </p>
            ))}
            {row.feeNotice && !row.feeNotice.acknowledged ? (
              <p>
                {row.feeNotice.investors} investors, above the {row.feeNotice.threshold} in the
                statement of work.
              </p>
            ) : null}
            <Link
              to="/funds/$offeringId"
              params={{ offeringId: row.id }}
              className="inline-block pt-1 text-sm underline"
            >
              Open the fund
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
