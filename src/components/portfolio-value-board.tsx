import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getPortfolioValue } from "@/lib/cap-table.functions";
import { supabase } from "@/integrations/supabase/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function money(cents?: number | null) {
  if (!cents) return "$0";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function preciseMoney(cents?: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function share(value: number) {
  if (!value) return "0%";
  return `${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}%`;
}

export function PortfolioValueBoard({ backTo }: { backTo: "/admin" | "/manager" }) {
  const load = useServerFn(getPortfolioValue);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const valueQuery = useQuery({
    queryKey: ["portfolio-value"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  // Refresh the moment a commitment or payment moves.
  useEffect(() => {
    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: ["portfolio-value"] });
    const channel = supabase
      .channel("portfolio-value-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "investor_applications" },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const data = valueQuery.data;
  const funds = data?.funds ?? [];
  const totals = data?.totals;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio value</h1>
          <p className="text-muted-foreground text-sm">
            What each fund is worth today and the value of a single share, updating as commitments
            and received money change.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={backTo}>Back</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Funds</CardDescription>
            <CardTitle className="text-2xl">{funds.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Committed</CardDescription>
            <CardTitle className="text-2xl">{money(totals?.committed_cents)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Received</CardDescription>
            <CardTitle className="text-2xl">{money(totals?.received_cents)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Equity value</CardDescription>
            <CardTitle className="text-2xl">{money(totals?.equity_value_cents)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {valueQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Working out the values…</p>
      ) : funds.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No funds are assigned to you yet.
          </CardContent>
        </Card>
      ) : null}

      {funds.map((fund) => {
        const expanded = open[fund.offering_id] ?? false;
        return (
          <Card key={fund.offering_id}>
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">{fund.offering_name}</CardTitle>
                <div className="flex items-center gap-2">
                  {fund.reg_type ? (
                    <Badge variant="secondary">Reg D {fund.reg_type}</Badge>
                  ) : null}
                  <Badge variant="outline">{fund.investors} investors</Badge>
                </div>
              </div>
              <CardDescription>
                {money(fund.committed_cents)} committed · {money(fund.received_cents)} received ·{" "}
                {fund.funded_pct}% of commitments funded
              </CardDescription>
              <Progress value={Math.min(100, fund.funded_pct)} className="h-2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Equity value</p>
                  <p className="text-lg font-semibold">{money(fund.equity_value_cents)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Shares issued</p>
                  <p className="text-lg font-semibold">
                    {fund.shares ? fund.shares.toLocaleString("en-US") : "—"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Value per share</p>
                  <p className="text-lg font-semibold">
                    {preciseMoney(fund.value_per_share_cents)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Committed per share</p>
                  <p className="text-lg font-semibold">
                    {preciseMoney(fund.committed_per_share_cents)}
                  </p>
                </div>
              </div>

              {fund.shares === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No shares have been recorded for this fund yet, so each investor's value is shown
                  by their share of the fund. Add shares on the cap table to see a value per share.
                </p>
              ) : null}

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setOpen((o) => ({ ...o, [fund.offering_id]: !expanded }))
                }
              >
                {expanded ? "Hide investors" : `Show ${fund.investors} investors`}
              </Button>

              {expanded ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left">
                        <th className="py-2 pr-3 font-medium">Investor</th>
                        <th className="py-2 pr-3 font-medium">Shares</th>
                        <th className="py-2 pr-3 font-medium">Share %</th>
                        <th className="py-2 pr-3 font-medium">Committed</th>
                        <th className="py-2 pr-3 font-medium">Received</th>
                        <th className="py-2 pr-3 font-medium">Value today</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fund.holders.map((h) => (
                        <tr key={h.application_id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{h.name}</div>
                            <div className="text-muted-foreground text-xs">
                              {h.email ?? "No email"} · {h.share_class}
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            {h.shares == null ? "—" : h.shares.toLocaleString("en-US")}
                          </td>
                          <td className="py-2 pr-3">{share(h.ownership_pct)}</td>
                          <td className="py-2 pr-3">{money(h.committed_cents)}</td>
                          <td className="py-2 pr-3">{money(h.received_cents)}</td>
                          <td className="py-2 pr-3 font-medium">{money(h.value_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button asChild size="sm" variant="ghost">
                  <Link to={backTo === "/admin" ? "/admin/cap-table" : "/manager/cap-table"}>
                    Edit shares on the cap table
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-muted-foreground text-xs">
        Equity value is the money actually received into the fund so far. It is not a third-party
        valuation.
      </p>
    </main>
  );
}
