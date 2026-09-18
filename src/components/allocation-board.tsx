import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  decideAllocations,
  generateInvestorStatements,
  getAllocationRun,
  getInvestorCapitalOverview,
  listAllocationQueue,
  respondToAllocations,
  runAllocationCalculation,
  submitAllocations,
  syncInvestorPositions,
  decideInvestorStatement,
} from "@/lib/allocations.functions";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : `${Number(cents) < 0 ? "−" : ""}$${Math.abs(Number(cents) / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const pct = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}%`;

const TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  calculating: "bg-muted text-muted-foreground",
  review: "bg-amber-100 text-amber-900",
  manager_review: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  finalized: "bg-emerald-100 text-emerald-900",
  published: "bg-emerald-100 text-emerald-900",
  superseded: "bg-muted text-muted-foreground",
};

/** Investor allocations, capital accounts and statements for one period. */
export function AllocationBoard({ role }: { role: "harmonious" | "manager" }) {
  const isStaff = role === "harmonious";
  const queryClient = useQueryClient();

  const loadQueue = useServerFn(listAllocationQueue);
  const loadRun = useServerFn(getAllocationRun);
  const loadOverview = useServerFn(getInvestorCapitalOverview);
  const calculate = useServerFn(runAllocationCalculation);
  const submit = useServerFn(submitAllocations);
  const decide = useServerFn(decideAllocations);
  const respond = useServerFn(respondToAllocations);
  const syncPositions = useServerFn(syncInvestorPositions);
  const makeStatements = useServerFn(generateInvestorStatements);
  const decideStatementFn = useServerFn(decideInvestorStatement);

  const [fundId, setFundId] = useState("");
  const [navId, setNavId] = useState("");
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const queue = useQuery({
    queryKey: ["allocation-queue", fundId],
    queryFn: () => loadQueue({ data: fundId ? { offering_id: fundId } : {} }),
  });

  const overview = useQuery({
    queryKey: ["allocation-overview", fundId],
    queryFn: () => loadOverview({ data: { offering_id: fundId } }),
    enabled: Boolean(fundId),
  });

  const detail = useQuery({
    queryKey: ["allocation-run", openRunId],
    queryFn: () => loadRun({ data: { run_id: openRunId! } }),
    enabled: Boolean(openRunId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["allocation-queue"] });
    queryClient.invalidateQueries({ queryKey: ["allocation-overview"] });
    queryClient.invalidateQueries({ queryKey: ["allocation-run"] });
  };

  const act = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => job(),
    onSuccess: () => {
      toast.success("Done.");
      setNote("");
      refresh();
    },
    onError: (error: any) => toast.error(error?.message ?? "That could not be completed."),
  });

  const funds = (queue.data?.funds ?? []) as any[];
  const runs = (queue.data?.runs ?? []) as any[];
  const totals = overview.data?.totals;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Investor allocations</CardTitle>
          <CardDescription>
            Fund net assets are shared out to each investor's capital account. Nothing is issued
            until investor capital adds back to the fund exactly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Fund</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={fundId}
                onChange={(event) => setFundId(event.target.value)}
              >
                <option value="">All funds</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </label>
            {isStaff ? (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Published NAV</span>
                  <Input
                    className="w-72"
                    placeholder="NAV reference"
                    value={navId}
                    onChange={(event) => setNavId(event.target.value)}
                  />
                </label>
                <Button
                  disabled={!navId || act.isPending}
                  onClick={() => act.mutate(() => calculate({ data: { nav_id: navId } }))}
                >
                  Work out allocations
                </Button>
                <Button
                  variant="outline"
                  disabled={!fundId || act.isPending}
                  onClick={() => act.mutate(() => syncPositions({ data: { offering_id: fundId } }))}
                >
                  Refresh investor list
                </Button>
              </>
            ) : null}
          </div>

          {totals ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <Figure label="Fund net assets" value={money(totals.fundNavCents)} />
              <Figure label="Investor capital" value={money(totals.investorCapitalCents)} />
              <Figure
                label="Unexplained"
                value={money(totals.differenceCents)}
                tone={totals.differenceCents === 0 ? "ok" : "bad"}
              />
              <Figure label="Unfunded commitments" value={money(totals.unfundedCents)} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Periods</CardTitle>
          <CardDescription>Every period, with who prepared, reviewed and approved it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {queue.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allocation periods yet.</p>
          ) : null}
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {run.period_start} – {run.period_end} · version {run.version}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unexplained difference {money(run.difference_cents ?? 0)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={TONE[run.status] ?? ""}>{run.status.replace("_", " ")}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenRunId(openRunId === run.id ? null : run.id)}
                  >
                    {openRunId === run.id ? "Hide" : "Open"}
                  </Button>
                </div>
              </div>

              {openRunId === run.id ? (
                <div className="mt-3 space-y-3">
                  <Textarea
                    placeholder={isStaff ? "Reason or note" : "Tell us what looks wrong"}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {isStaff ? (
                      <>
                        {run.status === "draft" ? (
                          <Button
                            size="sm"
                            onClick={() => act.mutate(() => submit({ data: { run_id: run.id } }))}
                          >
                            Send for review
                          </Button>
                        ) : null}
                        {run.status === "review" ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              act.mutate(() =>
                                decide({ data: { run_id: run.id, action: "review" } }),
                              )
                            }
                          >
                            Mark reviewed
                          </Button>
                        ) : null}
                        {["review", "manager_review"].includes(run.status) ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              act.mutate(() =>
                                decide({ data: { run_id: run.id, action: "approve" } }),
                              )
                            }
                          >
                            Approve
                          </Button>
                        ) : null}
                        {run.status === "approved" ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              act.mutate(() =>
                                decide({ data: { run_id: run.id, action: "finalize" } }),
                              )
                            }
                          >
                            Finalize capital accounts
                          </Button>
                        ) : null}
                        {run.status === "finalized" ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                act.mutate(() => makeStatements({ data: { run_id: run.id } }))
                              }
                            >
                              Prepare investor statements
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                act.mutate(() =>
                                  decide({
                                    data: { run_id: run.id, action: "revise", reason: note },
                                  }),
                                )
                              }
                            >
                              Open a revision
                            </Button>
                          </>
                        ) : null}
                        {["review", "manager_review"].includes(run.status) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              act.mutate(() =>
                                decide({
                                  data: { run_id: run.id, action: "return", reason: note },
                                }),
                              )
                            }
                          >
                            Send back
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            act.mutate(() =>
                              respond({
                                data: { run_id: run.id, response: "acknowledge", note },
                              }),
                            )
                          }
                        >
                          Acknowledge
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            act.mutate(() =>
                              respond({ data: { run_id: run.id, response: "challenge", note } }),
                            )
                          }
                        >
                          Challenge
                        </Button>
                      </>
                    )}
                  </div>

                  {detail.data ? (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="p-2">Investor</th>
                            <th className="p-2 text-right">Opening</th>
                            <th className="p-2 text-right">Contributions</th>
                            <th className="p-2 text-right">Income</th>
                            <th className="p-2 text-right">Fees</th>
                            <th className="p-2 text-right">Distributions</th>
                            <th className="p-2 text-right">Closing</th>
                            <th className="p-2 text-right">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detail.data.lines ?? []).map((line: any) => (
                            <tr key={line.id} className="border-t">
                              <td className="p-2">{line.position?.display_name ?? "Investor"}</td>
                              <td className="p-2 text-right">
                                {money(line.beginning_capital_cents)}
                              </td>
                              <td className="p-2 text-right">{money(line.contributions_cents)}</td>
                              <td className="p-2 text-right">
                                {money(
                                  Number(line.allocated_income_cents) -
                                    Number(line.allocated_loss_cents),
                                )}
                              </td>
                              <td className="p-2 text-right">{money(line.management_fees_cents)}</td>
                              <td className="p-2 text-right">{money(line.distributions_cents)}</td>
                              <td className="p-2 text-right font-medium">
                                {money(line.ending_capital_cents)}
                              </td>
                              <td className="p-2 text-right">{pct(line.ownership_pct)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {isStaff && detail.data?.statements?.length ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Statements</p>
                      {detail.data.statements.map((statement: any) => (
                        <div
                          key={statement.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                        >
                          <span>
                            {statement.snapshot?.investorName ?? "Investor"} · version{" "}
                            {statement.version}
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge className={TONE[statement.status] ?? ""}>
                              {statement.status}
                            </Badge>
                            {["draft", "review", "approved"].includes(statement.status) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  act.mutate(() =>
                                    decideStatementFn({
                                      data: {
                                        statement_id: statement.id,
                                        action:
                                          statement.status === "draft"
                                            ? "review"
                                            : statement.status === "review"
                                              ? "approve"
                                              : "publish",
                                      },
                                    }),
                                  )
                                }
                              >
                                {statement.status === "draft"
                                  ? "Mark reviewed"
                                  : statement.status === "review"
                                    ? "Approve"
                                    : "Publish"}
                              </Button>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold ${
          tone === "bad" ? "text-destructive" : tone === "ok" ? "text-emerald-700" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
