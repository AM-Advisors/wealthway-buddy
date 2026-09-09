import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getFundCapTable } from "@/lib/cap-table.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function money(cents?: number | null) {
  if (!cents) return "$0";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function share(value: number) {
  if (!value) return "0%";
  return `${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}%`;
}

/** Live ownership for a fund, built from what investors have committed. */
export function LiveCapTable({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundCapTable);
  const queryClient = useQueryClient();
  const queryKey = ["live-cap-table", offeringId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => load({ data: { offering_id: offeringId } }),
    refetchInterval: 60_000,
  });

  // Keep percentages current while the page stays open.
  useEffect(() => {
    const channel = supabase
      .channel(`live-cap-table-${offeringId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offeringId]);

  if (error) return null;

  const holders = data?.holders ?? [];
  const target = data?.target_raise_cents ?? 0;
  const raisedPct = target ? Math.min(100, ((data?.total_committed_cents ?? 0) / target) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ownership</CardTitle>
        <CardDescription>
          {isLoading
            ? "Loading…"
            : `${data?.holder_count ?? 0} investor${(data?.holder_count ?? 0) === 1 ? "" : "s"} · ${money(
                data?.total_committed_cents,
              )} committed · ${money(data?.total_funded_cents)} received`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {target ? (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Against a {money(target)} target</span>
              <span className="font-medium">{raisedPct.toFixed(1)}%</span>
            </div>
            <Progress value={raisedPct} />
          </div>
        ) : null}

        {data?.you ? (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">Your position</p>
            <p className="text-2xl font-semibold">{share(data.you.pct_of_committed)}</p>
            <p className="text-sm text-muted-foreground">
              {money(data.you.commitment_cents)} committed · {money(data.you.funded_cents)} received
              {target ? ` · ${share(data.you.pct_of_target)} of the target raise` : ""}
            </p>
          </div>
        ) : null}

        {holders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isLoading ? "" : "No commitments yet. Percentages appear as investors commit."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Investor</th>
                  <th className="py-2 pr-3 font-medium">Committed</th>
                  <th className="py-2 pr-3 font-medium">Received</th>
                  <th className="py-2 pr-3 font-medium">Share</th>
                  {target ? <th className="py-2 font-medium">Of target</th> : null}
                </tr>
              </thead>
              <tbody>
                {holders.map((h) => (
                  <tr key={h.application_id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className={h.is_you ? "font-medium" : ""}>{h.name}</span>{" "}
                      {h.funding_status === "settled" ? (
                        <Badge variant="secondary" className="ml-1">
                          Funded
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{money(h.commitment_cents)}</td>
                    <td className="py-2 pr-3">{money(h.funded_cents)}</td>
                    <td className="py-2 pr-3 font-medium">{share(h.pct_of_committed)}</td>
                    {target ? <td className="py-2">{share(h.pct_of_target)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && !data.names_visible && data.holder_count > holders.length ? (
          <p className="text-xs text-muted-foreground">
            Other investors in this fund are kept private.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
