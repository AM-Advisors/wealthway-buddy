import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  calculateFundNav,
  decideNav,
  getNavDetail,
  getNavQueue,
  overrideNavWarning,
  respondToNav,
  submitNav,
} from "@/lib/fund-nav.functions";
import type { NavCheckCode } from "@/lib/nav-model";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : `${cents < 0 ? "−" : ""}$${Math.abs(Number(cents) / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}%`;

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  calculating: "bg-muted text-muted-foreground",
  review: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  published: "bg-emerald-100 text-emerald-900",
  superseded: "bg-muted text-muted-foreground",
};

const SEVERITY_TONE: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-900",
  warning: "bg-amber-100 text-amber-900",
  blocking: "bg-rose-100 text-rose-900",
};

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 text-sm ${
        strong ? "font-semibold text-foreground" : "text-muted-foreground"
      }`}
    >
      <span>{label}</span>
      <span className={strong ? "" : "text-foreground"}>{value}</span>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function NavBoard({ role }: { role: "harmonious" | "manager" }) {
  const isStaff = role === "harmonious";
  const queryClient = useQueryClient();

  const loadQueue = useServerFn(getNavQueue);
  const loadDetail = useServerFn(getNavDetail);
  const calculate = useServerFn(calculateFundNav);
  const submit = useServerFn(submitNav);
  const decide = useServerFn(decideNav);
  const override = useServerFn(overrideNavWarning);
  const respond = useServerFn(respondToNav);

  const [fundId, setFundId] = useState("");
  const [asOfDate, setAsOfDate] = useState(today());
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const queue = useQuery({
    queryKey: ["nav-queue"],
    queryFn: () => loadQueue({ data: {} }),
  });

  const detail = useQuery({
    queryKey: ["nav-detail", openId],
    queryFn: () => loadDetail({ data: { navId: openId! } }),
    enabled: Boolean(openId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["nav-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["nav-detail"] });
  };

  const run = <T,>(fn: (input: T) => Promise<unknown>, success: string) =>
    useMutation({
      mutationFn: (input: T) => fn(input),
      onSuccess: () => {
        toast.success(success);
        refresh();
      },
      onError: (error: Error) => toast.error(error.message),
    });

  const calculateMutation = run(
    (data: { fundId: string; asOfDate: string }) => calculate({ data }),
    "NAV calculated from the ledger and approved valuations.",
  );
  const submitMutation = run(
    (data: { navId: string }) => submit({ data }),
    "NAV sent for review.",
  );
  const decideMutation = run(
    (data: { navId: string; action: "review" | "approve" | "return" | "publish" | "revise"; reason?: string }) =>
      decide({ data }),
    "NAV updated.",
  );
  const overrideMutation = run(
    (data: { navId: string; code: NavCheckCode; reason: string }) => override({ data }),
    "Override documented.",
  );
  const respondMutation = run(
    (data: { navId: string; action: "acknowledge" | "challenge" | "approve"; note?: string }) =>
      respond({ data }),
    "Sent to Harmonious.",
  );

  const navs = queue.data?.navs ?? [];
  const funds = queue.data?.funds ?? [];
  const open = useMemo(() => navs.find((n: any) => n.id === openId) ?? null, [navs, openId]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">
          {isStaff ? "NAV review" : "Fund NAV"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isStaff
            ? "Every NAV is derived from posted ledger balances and the valuations effective on the NAV date. Nothing here is typed in by hand."
            : "The net asset value of the funds you manage, with the movement behind it. Harmonious prepares and publishes; you can acknowledge or challenge."}
        </p>
      </header>

      {isStaff ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calculate a NAV</CardTitle>
            <CardDescription>Pick a fund and a date. The engine does the rest.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Fund</label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
              >
                <option value="">Select a fund</option>
                {funds.map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground">As at</label>
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              disabled={!fundId || calculateMutation.isPending}
              onClick={() => calculateMutation.mutate({ fundId, asOfDate })}
            >
              Calculate NAV
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {queue.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : navs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No NAV has been prepared yet.</p>
      ) : null}

      <div className="space-y-4">
        {navs.map((nav: any) => {
          const checks = (nav.checks ?? []) as {
            code: NavCheckCode;
            severity: string;
            detail: string;
            overridable: boolean;
          }[];
          const failing = checks.filter((c) => c.severity !== "pass");
          const isOpen = openId === nav.id;
          return (
            <Card key={nav.id}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {nav.fund_name} — {nav.period_label ?? nav.as_of_date}
                    </CardTitle>
                    <CardDescription>
                      As at {nav.as_of_date} · version {nav.version} · cut off{" "}
                      {nav.source_cutoff_at ? String(nav.source_cutoff_at).slice(0, 16).replace("T", " ") : "—"}
                    </CardDescription>
                  </div>
                  <Badge className={STATUS_TONE[nav.status] ?? ""}>{nav.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Net asset value
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{money(nav.net_asset_value_cents)}</p>
                    {nav.nav_per_unit_cents ? (
                      <p className="text-xs text-muted-foreground">
                        {money(nav.nav_per_unit_cents)} per unit
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Prior NAV</p>
                    <p className="mt-1 text-2xl font-semibold">{money(nav.prior_nav_cents)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Movement</p>
                    <p className="mt-1 text-2xl font-semibold">{money(nav.change_cents)}</p>
                    <p className="text-xs text-muted-foreground">{pct(nav.change_pct)}</p>
                  </div>
                </div>

                <Tabs defaultValue="package">
                  <TabsList>
                    <TabsTrigger value="package">Assets & liabilities</TabsTrigger>
                    <TabsTrigger value="bridge">Movement</TabsTrigger>
                    <TabsTrigger value="checks">
                      Checks{failing.length ? ` (${failing.length})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="sources" onClick={() => setOpenId(nav.id)}>
                      Where it comes from
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="package" className="pt-3">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                          Assets
                        </p>
                        <Line label="Cash" value={money(nav.cash_cents)} />
                        <Line label="Investments" value={money(nav.investments_fair_value_cents)} />
                        <Line label="Receivables" value={money(nav.receivables_cents)} />
                        <Line label="Accrued income" value={money(nav.accrued_income_cents)} />
                        <Line label="Other assets" value={money(nav.other_assets_cents)} />
                        <Line label="Gross assets" value={money(nav.gross_asset_value_cents)} strong />
                      </div>
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                          Liabilities
                        </p>
                        <Line label="Payables" value={money(nav.payables_cents)} />
                        <Line label="Accrued expenses" value={money(nav.accrued_expenses_cents)} />
                        <Line label="Management fees" value={money(nav.management_fee_cents)} />
                        <Line label="Tax and withholding" value={money(nav.tax_liabilities_cents)} />
                        <Line label="Other liabilities" value={money(nav.other_liabilities_cents)} />
                        <Line
                          label="Total liabilities"
                          value={money(nav.total_liabilities_cents)}
                          strong
                        />
                        <Line
                          label="Net asset value"
                          value={money(nav.net_asset_value_cents)}
                          strong
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="bridge" className="pt-3">
                    <Line label="Beginning NAV" value={money(nav.bridge?.beginningNavCents)} strong />
                    {(nav.bridge?.lines ?? []).map((l: any) => (
                      <Line key={l.key} label={l.label} value={money(l.amountCents)} />
                    ))}
                    <Line label="Ending NAV" value={money(nav.bridge?.endingNavCents)} strong />
                    {nav.bridge && !nav.bridge.reconciles ? (
                      <p className="mt-2 text-sm text-rose-700">
                        {money(nav.bridge.differenceCents)} of the movement is unexplained. This NAV
                        cannot be published until it reconciles.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-emerald-700">
                        The movement reconciles exactly to ending NAV.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="checks" className="space-y-2 pt-3">
                    {checks.map((c) => (
                      <div
                        key={c.code}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge className={SEVERITY_TONE[c.severity] ?? ""}>{c.severity}</Badge>
                            <span className="text-sm font-medium">{c.code.replace(/_/g, " ")}</span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{c.detail}</p>
                        </div>
                        {isStaff && c.severity === "blocking" && c.overridable ? (
                          <div className="flex w-full gap-2 sm:w-auto">
                            <Input
                              placeholder="Documented reason"
                              value={notes[`${nav.id}:${c.code}`] ?? ""}
                              onChange={(e) =>
                                setNotes((n) => ({ ...n, [`${nav.id}:${c.code}`]: e.target.value }))
                              }
                            />
                            <Button
                              variant="outline"
                              onClick={() =>
                                overrideMutation.mutate({
                                  navId: nav.id,
                                  code: c.code,
                                  reason: notes[`${nav.id}:${c.code}`] ?? "",
                                })
                              }
                            >
                              Override
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="sources" className="pt-3">
                    {!isOpen ? (
                      <Button variant="outline" onClick={() => setOpenId(nav.id)}>
                        Show the underlying records
                      </Button>
                    ) : detail.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                            Valuations used
                          </p>
                          {((detail.data?.inputs?.valuations ?? []) as any[]).map((v) => (
                            <Line
                              key={v.assetId}
                              label={`${v.assetName} · ${v.effectiveDate ?? "no valuation"}${
                                v.version ? ` · v${v.version}` : ""
                              }`}
                              value={money(v.valueCents)}
                            />
                          ))}
                        </div>
                        <div>
                          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                            Ledger accounts
                          </p>
                          {((detail.data?.inputs?.snapshot as any)?.balances ?? []).map((b: any) => (
                            <Line
                              key={b.accountId}
                              label={`${b.code} ${b.name}`}
                              value={money(b.debitCents - b.creditCents)}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Methodology {detail.data?.inputs?.methodologyVersion} · prepared from data
                          as at {String(detail.data?.inputs?.sourceCutoffAt ?? "").slice(0, 16).replace("T", " ")}
                        </p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                <div className="flex flex-wrap gap-2">
                  {isStaff ? (
                    <>
                      {nav.status === "draft" ? (
                        <Button onClick={() => submitMutation.mutate({ navId: nav.id })}>
                          Send for review
                        </Button>
                      ) : null}
                      {nav.status === "review" ? (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => decideMutation.mutate({ navId: nav.id, action: "review" })}
                          >
                            Mark reviewed
                          </Button>
                          <Button
                            onClick={() => decideMutation.mutate({ navId: nav.id, action: "approve" })}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              decideMutation.mutate({
                                navId: nav.id,
                                action: "return",
                                reason: notes[nav.id] ?? "Returned for rework",
                              })
                            }
                          >
                            Send back
                          </Button>
                        </>
                      ) : null}
                      {nav.status === "approved" ? (
                        <Button onClick={() => decideMutation.mutate({ navId: nav.id, action: "publish" })}>
                          Publish
                        </Button>
                      ) : null}
                      {nav.status === "published" ? (
                        <div className="flex w-full gap-2">
                          <Input
                            placeholder="Reason for a revised NAV"
                            value={notes[nav.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [nav.id]: e.target.value }))}
                          />
                          <Button
                            variant="outline"
                            onClick={() =>
                              decideMutation.mutate({
                                navId: nav.id,
                                action: "revise",
                                reason: notes[nav.id] ?? "",
                              })
                            }
                          >
                            Start a revised version
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => respondMutation.mutate({ navId: nav.id, action: "acknowledge" })}
                      >
                        Acknowledge
                      </Button>
                      <div className="flex w-full gap-2 sm:w-auto">
                        <Textarea
                          rows={1}
                          placeholder="What looks wrong?"
                          value={notes[nav.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [nav.id]: e.target.value }))}
                        />
                        <Button
                          variant="ghost"
                          onClick={() =>
                            respondMutation.mutate({
                              navId: nav.id,
                              action: "challenge",
                              note: notes[nav.id] ?? "",
                            })
                          }
                        >
                          Challenge
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                {nav.manager_challenge_note ? (
                  <p className="text-sm text-amber-700">
                    Fund manager challenge: {nav.manager_challenge_note}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
