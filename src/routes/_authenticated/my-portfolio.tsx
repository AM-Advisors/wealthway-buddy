import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getMyPortfolioValue } from "@/lib/cap-table.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/my-portfolio")({
  head: () => ({
    meta: [
      { title: "My Portfolio Value — Harmonious" },
      {
        name: "description",
        content:
          "The value of your holdings in each Harmonious fund: shares, price per share, committed capital and money received.",
      },
      { property: "og:title", content: "My Portfolio Value — Harmonious" },
      {
        property: "og:description",
        content: "Shares, price per share and equity value for each of your fund positions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyPortfolio,
});

function money(cents: number | null | undefined) {
  if (!cents && cents !== 0) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function share(value: number) {
  if (!value) return "0%";
  return `${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}%`;
}

function MyPortfolio() {
  const load = useServerFn(getMyPortfolioValue);
  const queryClient = useQueryClient();
  const queryKey = ["my-portfolio-value"];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  // Live updates: new commitments and received wires revalue the holdings.
  useEffect(() => {
    const channel = supabase
      .channel("my-portfolio-value")
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
  const totalValue = funds.reduce((sum, f) => sum + f.equity_value_cents, 0);
  const totalCommitted = funds.reduce((sum, f) => sum + f.commitment_cents, 0);
  const totalReceived = funds.reduce((sum, f) => sum + f.funded_cents, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Your portfolio value</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            What your holdings are worth in each fund, updated as commitments and wires come in.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/portal">Back to your portal</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading your holdings…</p>
      ) : funds.length === 0 ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">No holdings yet</CardTitle>
            <CardDescription>
              Once your subscription is confirmed, your shares and their value appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link to="/portal">Go to your portal</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Across your funds</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Portfolio value
                </p>
                <p className="text-2xl font-semibold">{money(totalValue)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Committed</p>
                <p className="text-2xl font-semibold">{money(totalCommitted)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Received</p>
                <p className="text-2xl font-semibold">{money(totalReceived)}</p>
              </div>
            </CardContent>
          </Card>

          {funds.map((fund) => (
            <Card key={fund.offering_id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">
                    {fund.offering_name}
                    {fund.reg_type ? ` (Reg D ${fund.reg_type})` : ""}
                  </CardTitle>
                  <CardDescription>
                    {fund.share_class} · {share(fund.pct_of_committed)} of the fund
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {fund.valued_by === "share_price" ? "Priced per share" : "Valued at cost"}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Equity value
                  </p>
                  <p className="text-xl font-semibold">{money(fund.equity_value_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {fund.valued_by === "share_price"
                      ? `${fund.shares?.toLocaleString("en-US")} shares × ${money(
                          fund.share_price_cents,
                        )} per share`
                      : "Based on the capital the fund has received from you"}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Committed</span>
                    <span className="font-medium">{money(fund.commitment_cents)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Received by the fund</span>
                    <span className="font-medium">{money(fund.funded_cents)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Your shares</span>
                    <span className="font-medium">
                      {fund.shares != null ? fund.shares.toLocaleString("en-US") : "—"}
                    </span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/diligence/$offeringId" params={{ offeringId: fund.offering_id }}>
                      Open this fund's room
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
