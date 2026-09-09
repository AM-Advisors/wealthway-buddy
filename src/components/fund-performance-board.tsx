import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getFundPerformance,
  removePerformanceEntry,
  saveFundDistribution,
  saveFundValuation,
  type FundPerformance,
} from "@/lib/performance.functions";
import { supabase } from "@/integrations/supabase/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

function money(cents?: number | null) {
  if (!cents) return "$0";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function signedMoney(cents: number) {
  return `${cents < 0 ? "−" : "+"}${money(Math.abs(cents))}`;
}

function pct(value: number | null) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function multiple(value: number | null) {
  return value == null ? "—" : `${value.toFixed(2)}x`;
}

function monthLabel(period: string) {
  const [y, m] = period.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function CashFlowChart({ fund }: { fund: FundPerformance }) {
  if (fund.cash_flows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No money has moved yet. Cash flow appears here as wires settle.
      </p>
    );
  }
  const peak = Math.max(
    1,
    ...fund.cash_flows.map((p) => Math.max(p.contributions_cents, p.distributions_cents)),
  );
  return (
    <div className="space-y-2">
      {fund.cash_flows.map((point) => (
        <div key={point.period} className="grid grid-cols-[7rem_1fr_9rem] items-center gap-3">
          <span className="text-xs text-muted-foreground">{monthLabel(point.period)}</span>
          <div className="space-y-1">
            <div className="h-2 rounded bg-muted">
              <div
                className="h-2 rounded bg-primary"
                style={{ width: `${(point.contributions_cents / peak) * 100}%` }}
              />
            </div>
            <div className="h-2 rounded bg-muted">
              <div
                className="h-2 rounded bg-accent"
                style={{ width: `${(point.distributions_cents / peak) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-right text-xs tabular-nums">
            <span className="block">In {money(point.contributions_cents)}</span>
            <span className="block text-muted-foreground">
              Out {money(point.distributions_cents)}
            </span>
          </span>
        </div>
      ))}
      <p className="pt-1 text-xs text-muted-foreground">
        Top bar is money received from investors, lower bar is money paid back out.
      </p>
    </div>
  );
}

function EntryForms({ fund, onDone }: { fund: FundPerformance; onDone: () => void }) {
  const saveValuation = useServerFn(saveFundValuation);
  const saveDistribution = useServerFn(saveFundDistribution);
  const removeEntry = useServerFn(removePerformanceEntry);

  const [navAmount, setNavAmount] = useState("");
  const [navDate, setNavDate] = useState(today());
  const [navNote, setNavNote] = useState("");
  const [distAmount, setDistAmount] = useState("");
  const [distDate, setDistDate] = useState(today());
  const [distNote, setDistNote] = useState("");

  const valuationMutation = useMutation({
    mutationFn: () =>
      saveValuation({
        data: {
          offering_id: fund.offering_id,
          as_of_date: navDate,
          nav_cents: Math.round(Number(navAmount) * 100),
          note: navNote,
        },
      }),
    onSuccess: () => {
      toast.success("Fund value saved");
      setNavAmount("");
      setNavNote("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const distributionMutation = useMutation({
    mutationFn: () =>
      saveDistribution({
        data: {
          offering_id: fund.offering_id,
          paid_on: distDate,
          amount_cents: Math.round(Number(distAmount) * 100),
          kind: "distribution",
          note: distNote,
        },
      }),
    onSuccess: () => {
      toast.success("Distribution recorded");
      setDistAmount("");
      setDistNote("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: string; kind: "valuation" | "distribution" }) =>
      removeEntry({ data: { offering_id: fund.offering_id, ...input } }),
    onSuccess: () => {
      toast.success("Entry removed");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3 rounded-lg border p-4">
        <h4 className="text-sm font-semibold">What the fund is worth today</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`nav-date-${fund.offering_id}`}>As of</Label>
            <Input
              id={`nav-date-${fund.offering_id}`}
              type="date"
              value={navDate}
              onChange={(e) => setNavDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`nav-amount-${fund.offering_id}`}>Value (USD)</Label>
            <Input
              id={`nav-amount-${fund.offering_id}`}
              inputMode="decimal"
              placeholder="1250000"
              value={navAmount}
              onChange={(e) => setNavAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`nav-note-${fund.offering_id}`}>Note (optional)</Label>
          <Input
            id={`nav-note-${fund.offering_id}`}
            value={navNote}
            onChange={(e) => setNavNote(e.target.value)}
            placeholder="Q3 valuation"
          />
        </div>
        <Button
          size="sm"
          disabled={!navAmount || Number.isNaN(Number(navAmount)) || valuationMutation.isPending}
          onClick={() => valuationMutation.mutate()}
        >
          Save value
        </Button>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {fund.valuations.slice(0, 5).map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2">
              <span>
                {v.as_of_date} · {money(v.nav_cents)}
                {v.note ? ` · ${v.note}` : ""}
              </span>
              <button
                type="button"
                className="underline"
                onClick={() => deleteMutation.mutate({ id: v.id, kind: "valuation" })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h4 className="text-sm font-semibold">Money paid back to investors</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`dist-date-${fund.offering_id}`}>Paid on</Label>
            <Input
              id={`dist-date-${fund.offering_id}`}
              type="date"
              value={distDate}
              onChange={(e) => setDistDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`dist-amount-${fund.offering_id}`}>Amount (USD)</Label>
            <Input
              id={`dist-amount-${fund.offering_id}`}
              inputMode="decimal"
              placeholder="50000"
              value={distAmount}
              onChange={(e) => setDistAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`dist-note-${fund.offering_id}`}>Note (optional)</Label>
          <Input
            id={`dist-note-${fund.offering_id}`}
            value={distNote}
            onChange={(e) => setDistNote(e.target.value)}
            placeholder="Quarterly distribution"
          />
        </div>
        <Button
          size="sm"
          disabled={
            !distAmount || Number.isNaN(Number(distAmount)) || distributionMutation.isPending
          }
          onClick={() => distributionMutation.mutate()}
        >
          Record distribution
        </Button>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {fund.distributions.slice(0, 5).map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <span>
                {d.paid_on} · {money(d.amount_cents)}
                {d.note ? ` · ${d.note}` : ""}
              </span>
              <button
                type="button"
                className="underline"
                onClick={() => deleteMutation.mutate({ id: d.id, kind: "distribution" })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function FundPerformanceBoard({ backTo }: { backTo: "/admin" | "/manager" }) {
  const load = useServerFn(getFundPerformance);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: ["fund-performance"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["fund-performance"] });
    const channel = supabase
      .channel("fund-performance-live")
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

  const data = query.data;
  const funds = data?.funds ?? [];
  const totals = data?.totals ?? null;
  const totalValue = totals ? totals.nav_cents + totals.distributed_cents : 0;
  const totalGain = totals ? totalValue - totals.contributed_cents : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fund performance</h1>
          <p className="text-sm text-muted-foreground">
            Return, IRR and cash flow for each fund, updating as commitments and wires change.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Refresh
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={backTo}>Back</Link>
          </Button>
        </div>
      </div>

      {totals && funds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>All funds</CardTitle>
            <CardDescription>Across every fund you can see.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Money received</p>
              <p className="text-xl font-semibold">{money(totals.contributed_cents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paid back out</p>
              <p className="text-xl font-semibold">{money(totals.distributed_cents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current value</p>
              <p className="text-xl font-semibold">{money(totals.nav_cents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gain</p>
              <p className="text-xl font-semibold">{signedMoney(totalGain)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!query.isLoading && funds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No funds are assigned to you yet.
          </CardContent>
        </Card>
      ) : null}

      {funds.map((fund) => {
        const isOpen = open[fund.offering_id] ?? false;
        const raised =
          fund.target_raise_cents && fund.target_raise_cents > 0
            ? Math.min(100, (fund.contributed_cents / fund.target_raise_cents) * 100)
            : null;
        return (
          <Card key={fund.offering_id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {fund.offering_name}
                    {fund.reg_type ? <Badge variant="secondary">{fund.reg_type}</Badge> : null}
                    {fund.nav_is_estimate ? (
                      <Badge variant="outline">Value not set</Badge>
                    ) : (
                      <Badge variant="outline">Valued {fund.nav_as_of}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {fund.investors} funded investor{fund.investors === 1 ? "" : "s"}
                    {fund.years_active != null ? ` · ${fund.years_active} yrs active` : ""}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOpen((prev) => ({ ...prev, [fund.offering_id]: !isOpen }))
                  }
                >
                  {isOpen ? "Hide detail" : "Cash flow and entries"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <p className="text-xs text-muted-foreground">Committed</p>
                  <p className="font-semibold">{money(fund.committed_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Received</p>
                  <p className="font-semibold">{money(fund.contributed_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current value</p>
                  <p className="font-semibold">{money(fund.nav_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Return</p>
                  <p className="font-semibold">{pct(fund.return_pct)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IRR</p>
                  <p className="font-semibold">{pct(fund.irr_pct)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Multiple</p>
                  <p className="font-semibold">{multiple(fund.tvpi)}</p>
                </div>
              </div>

              <div className="grid gap-4 text-sm sm:grid-cols-3">
                <p className="text-muted-foreground">
                  Paid back out (DPI): {money(fund.distributed_cents)} · {multiple(fund.dpi)}
                </p>
                <p className="text-muted-foreground">
                  Still held (RVPI): {money(fund.nav_cents)} · {multiple(fund.rvpi)}
                </p>
                <p className="text-muted-foreground">
                  Gain: {signedMoney(fund.gain_cents)}
                </p>
              </div>

              {raised != null ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Received against target</span>
                    <span>
                      {money(fund.contributed_cents)} of {money(fund.target_raise_cents)}
                    </span>
                  </div>
                  <Progress value={raised} />
                </div>
              ) : null}

              {fund.nav_is_estimate ? (
                <p className="text-xs text-muted-foreground">
                  No fund value recorded yet, so return and IRR assume the fund is still worth the
                  money received. Add a value below for accurate figures.
                </p>
              ) : null}

              {isOpen ? (
                <div className="space-y-6 border-t pt-5">
                  <CashFlowChart fund={fund} />
                  <EntryForms
                    fund={fund}
                    onDone={() =>
                      void queryClient.invalidateQueries({ queryKey: ["fund-performance"] })
                    }
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
