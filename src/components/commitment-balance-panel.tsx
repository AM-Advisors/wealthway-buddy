import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getFundCommitmentBalance } from "@/lib/subscription.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function money(cents?: number | null) {
  if (!cents) return "$0";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function CommitmentBalancePanel({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundCommitmentBalance);
  const queryClient = useQueryClient();
  const queryKey = ["commitment-balance", fundId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => load({ data: { fundId } }),
    refetchInterval: 60_000,
  });

  // Keep the balance live while the page is open.
  useEffect(() => {
    const channel = supabase
      .channel(`commitment-balance-${fundId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "investor_applications" }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundId]);

  const totals = data?.totals;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Commitment balance</CardTitle>
        <CardDescription>
          {isLoading
            ? "Loading…"
            : `${totals?.confirmedSubscriptions ?? 0} of ${totals?.investors ?? 0} investors have confirmed their commitment.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Committed" value={money(totals?.committedCents)} />
          <Stat label="Confirmed by investors" value={money(totals?.confirmedCents)} />
          <Stat label="Funds received" value={money(totals?.receivedCents)} />
          <Stat label="Still to arrive" value={money(totals?.outstandingCents)} />
        </div>

        {totals && (totals.wireFeeCents > 0 || totals.closingCostCents > 0) ? (
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Costs</p>
            <p className="mt-1 text-sm">
              Wire fees {money(totals.wireFeesTotalCents)}
              {totals.wireFeeCents > 0 ? ` (${money(totals.wireFeeCents)} per wire)` : ""} · Closing
              cost {money(totals.closingCostCents)}
            </p>
            <p className="mt-1 text-sm font-medium">
              {money(totals.netReceivedCents)} net after {money(totals.totalCostsCents)} of costs
            </p>
          </div>
        ) : null}

        {totals?.targetCents ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {money(totals.receivedCents)} received of {money(totals.targetCents)} target
              </span>
              <span className="font-medium">{totals.percentOfTarget ?? 0}%</span>
            </div>
            <Progress value={totals.percentOfTarget ?? 0} />
            <p className="text-xs text-muted-foreground">
              {money(totals.committedCents)} committed ({totals.percentCommittedOfTarget ?? 0}% of target) ·{" "}
              {money(totals.inFlightCents)} in transit · {money(totals.remainingToTargetCents)} left to raise
            </p>
          </div>
        ) : null}

        <div className="divide-y rounded-md border">
          {(data?.investors ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No investors in this fund yet.</p>
          ) : (
            (data?.investors ?? []).map((inv) => (
              <div key={inv.applicationId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{inv.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {inv.ownershipTitle ? `${inv.ownershipTitle} · ` : ""}
                    {inv.paymentMethod === "ach" ? "Bank debit" : inv.paymentMethod === "wire" ? "Bank wire" : "No method yet"}
                    {inv.confirmedAt
                      ? ` · confirmed ${new Date(inv.confirmedAt).toLocaleDateString("en-US")}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{money(inv.commitmentCents)}</span>
                  <Badge variant={inv.receivedCents > 0 ? "default" : inv.confirmed ? "secondary" : "outline"}>
                    {inv.receivedCents > 0 ? "Received" : inv.confirmed ? "Confirmed" : "Not confirmed"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
