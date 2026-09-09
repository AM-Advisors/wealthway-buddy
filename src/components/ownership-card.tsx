import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getMyOwnership } from "@/lib/cap-table.functions";
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

/** What the signed-in investor owns in each of their funds. */
export function OwnershipCard() {
  const load = useServerFn(getMyOwnership);
  const queryClient = useQueryClient();
  const queryKey = ["my-ownership"];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("my-ownership")
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
  }, []);

  const funds = data ?? [];
  if (!isLoading && funds.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your ownership</CardTitle>
        <CardDescription>
          Your share of each fund, updated as commitments and wires come in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {funds.map((fund) => {
          const you = fund.you!;
          return (
            <div key={fund.offering_id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{fund.offering_name}</p>
                <p className="text-2xl font-semibold">{share(you.pct_of_committed)}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {money(you.commitment_cents)} committed · {money(you.funded_cents)} received
              </p>
              <div className="mt-3 space-y-1">
                <Progress value={Math.min(100, you.pct_of_committed)} />
                <p className="text-xs text-muted-foreground">
                  Of {money(fund.total_committed_cents)} committed across{" "}
                  {fund.holder_count} investor{fund.holder_count === 1 ? "" : "s"}
                  {fund.target_raise_cents
                    ? ` · ${share(you.pct_of_target)} of the ${money(fund.target_raise_cents)} target`
                    : ""}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
