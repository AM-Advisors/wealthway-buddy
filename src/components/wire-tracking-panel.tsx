import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getWireTracking } from "@/lib/manager.functions";
import { money } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STAGE_LABEL: Record<string, string> = {
  not_started: "No wire yet",
  awaiting_wire: "Waiting on investor",
  submitted: "Confirmation to review",
  processing: "With the bank",
  received: "Funds received",
  problem: "Needs attention",
};

const STAGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  not_started: "outline",
  awaiting_wire: "outline",
  submitted: "default",
  processing: "secondary",
  received: "secondary",
  problem: "destructive",
};

function when(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function day(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function WireTrackingPanel() {
  const fetchTracking = useServerFn(getWireTracking);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["wire-tracking"],
    queryFn: () => fetchTracking(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading wire tracking…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-muted-foreground">Wire tracking is unavailable right now.</p>;
  }

  const rows = (data.rows ?? []) as any[];
  const totals = data.totals as any;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Wire tracking</CardTitle>
        <CardDescription>
          Where every investor's money is, and when the bank confirmed it landed. Updates on its
          own every minute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Tally label="Waiting on investor" value={totals.awaiting} />
          <Tally label="To review" value={totals.submitted} />
          <Tally label="With the bank" value={totals.processing} />
          <Tally label="Received" value={totals.received} />
          <Tally label="Needs attention" value={totals.problem} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border px-2 py-1">
            {money(totals.receivedCents)} received
          </span>
          <span className="rounded-md border px-2 py-1">
            {money(totals.inFlightCents)} still on the way
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No investor has reached the funding step yet.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {rows.map((row) => (
              <div
                key={row.applicationId}
                className="flex flex-wrap items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{row.investorName}</p>
                    <Badge variant={STAGE_VARIANT[row.stage] ?? "outline"}>
                      {STAGE_LABEL[row.stage] ?? row.stage}
                    </Badge>
                    {row.method ? (
                      <Badge variant="outline">{row.method === "ach" ? "ACH" : "Wire"}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.fundName} · {money(row.amountCents ?? row.commitmentCents)}
                    {row.referenceCode ? ` · Ref ${row.referenceCode}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.bankConfirmedAt
                      ? `Bank confirmed ${when(row.bankConfirmedAt)}`
                      : row.wire
                        ? `Investor said they sent it ${day(row.wire.sentOn) ?? "recently"} from ${row.wire.bankName} ····${row.wire.last4}${
                            row.wire.reviewedAt ? ` · reviewed ${when(row.wire.reviewedAt)}` : " · not reviewed yet"
                          }`
                        : row.expectedDate
                          ? `Expected ${day(row.expectedDate)} — no confirmation from the investor yet`
                          : "No confirmation from the investor yet"}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    to="/manager/investors"
                    search={{ application: row.applicationId } as never}
                  >
                    Open
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl">{value}</p>
    </div>
  );
}
