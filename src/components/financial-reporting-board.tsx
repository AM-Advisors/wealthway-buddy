import { useState } from "react";
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
  amendFinancialReport,
  buildWorkpapers,
  decideFinancialReport,
  decideWorkpaper,
  getCloseChecklist,
  getFinancialReport,
  getManagerFinancials,
  getReportingQueue,
  getStatementLineProvenance,
  listFundWorkpapers,
  prepareStatements,
  respondToFinancialReport,
  updateCloseChecklistItem,
} from "@/lib/financial-reporting.functions";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : `${Number(cents) < 0 ? "−" : ""}$${Math.abs(Number(cents) / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  prepared: "bg-sky-100 text-sky-900",
  review: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  published: "bg-emerald-100 text-emerald-900",
  superseded: "bg-muted text-muted-foreground",
};

const SEVERITY_TONE: Record<string, string> = {
  warning: "bg-amber-100 text-amber-900",
  blocking: "bg-rose-100 text-rose-900",
};

const label = (value: string) => value.replaceAll("_", " ");
const today = () => new Date().toISOString().slice(0, 10);

function ReportRow({
  report,
  onOpen,
  actions,
}: {
  report: any;
  onOpen: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3">
      <button type="button" className="text-left" onClick={onOpen}>
        <p className="text-sm font-medium capitalize">{label(report.report_type)}</p>
        <p className="text-xs text-muted-foreground">
          {report.fundName ? `${report.fundName} · ` : ""}
          {report.period_start} to {report.period_end} · v{report.version} · {report.basis}
        </p>
      </button>
      <div className="flex items-center gap-2">
        <Badge className={STATUS_TONE[report.status] ?? "bg-muted"}>{label(report.status)}</Badge>
        {actions}
      </div>
    </div>
  );
}

export function FinancialReportingBoard({ role }: { role: "harmonious" | "manager" }) {
  const isStaff = role === "harmonious";
  const queryClient = useQueryClient();

  const loadQueue = useServerFn(getReportingQueue);
  const loadManager = useServerFn(getManagerFinancials);
  const loadDetail = useServerFn(getFinancialReport);
  const loadProvenance = useServerFn(getStatementLineProvenance);
  const loadWorkpapers = useServerFn(listFundWorkpapers);
  const loadChecklist = useServerFn(getCloseChecklist);
  const prepare = useServerFn(prepareStatements);
  const decide = useServerFn(decideFinancialReport);
  const amend = useServerFn(amendFinancialReport);
  const respond = useServerFn(respondToFinancialReport);
  const generate = useServerFn(buildWorkpapers);
  const signOff = useServerFn(decideWorkpaper);
  const setChecklistItem = useServerFn(updateCloseChecklistItem);

  const [fundId, setFundId] = useState("");
  const [periodStart, setPeriodStart] = useState(`${today().slice(0, 4)}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(today());
  const [openId, setOpenId] = useState<string | null>(null);
  const [lineKey, setLineKey] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const queue = useQuery({
    queryKey: ["financial-queue", role],
    queryFn: async (): Promise<any> =>
      isStaff ? loadQueue({ data: {} }) : loadManager({ data: {} }),
  });

  const detail = useQuery({
    queryKey: ["financial-report", openId],
    queryFn: () => loadDetail({ data: { reportId: openId! } }),
    enabled: Boolean(openId),
  });

  const provenance = useQuery({
    queryKey: ["financial-provenance", openId, lineKey],
    queryFn: () => loadProvenance({ data: { reportId: openId!, lineKey: lineKey! } }),
    enabled: Boolean(openId && lineKey),
  });

  const workpapers = useQuery({
    queryKey: ["financial-workpapers", fundId],
    queryFn: () => loadWorkpapers({ data: { fundId } }),
    enabled: Boolean(fundId),
  });

  const checklist = useQuery({
    queryKey: ["financial-checklist", fundId, periodEnd],
    queryFn: () => loadChecklist({ data: { fundId, periodEnd } }),
    enabled: Boolean(fundId) && isStaff,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["financial-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["financial-report"] });
    void queryClient.invalidateQueries({ queryKey: ["financial-workpapers"] });
    void queryClient.invalidateQueries({ queryKey: ["financial-checklist"] });
  };

  const mutate = (fn: (input: any) => Promise<unknown>, success: string) => ({
    mutationFn: (input: any) => fn(input),
    onSuccess: () => {
      toast.success(success);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const prepareMutation = useMutation(
    mutate(
      (data: any) => prepare({ data }),
      "Statements prepared from the posted ledger, approved valuations and finalized allocations.",
    ),
  );
  const decideMutation = useMutation(mutate((data: any) => decide({ data }), "Report updated."));
  const amendMutation = useMutation(
    mutate((data: any) => amend({ data }), "A new version has been drafted; the published one is untouched."),
  );
  const respondMutation = useMutation(mutate((data: any) => respond({ data }), "Response recorded."));
  const workpaperMutation = useMutation(
    mutate((data: any) => generate({ data }), "Workpapers rebuilt from source records."),
  );
  const signOffMutation = useMutation(mutate((data: any) => signOff({ data }), "Workpaper updated."));
  const checklistMutation = useMutation(
    mutate((data: any) => setChecklistItem({ data }), "Close checklist updated."),
  );

  const data: any = queue.data ?? {};
  const reports: any[] = data.reports ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">
        {isStaff ? "Financial reporting" : "Fund financials"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isStaff
          ? "Every statement is built from the posted ledger, approved valuations, the approved NAV and finalized investor capital, and keeps the exact sources it was built from."
          : "Published financial statements for the funds you manage. You can acknowledge them or raise a challenge; Harmonious prepares and publishes."}
      </p>

      <Tabs defaultValue={isStaff ? "queue" : "published"} className="mt-6">
        <TabsList>
          {isStaff ? <TabsTrigger value="queue">Work queue</TabsTrigger> : null}
          <TabsTrigger value="published">
            {isStaff ? "Published" : "Published statements"}
          </TabsTrigger>
          {isStaff ? <TabsTrigger value="prepare">Prepare a period</TabsTrigger> : null}
          <TabsTrigger value="workpapers">Workpapers</TabsTrigger>
          {isStaff ? <TabsTrigger value="close">Close checklist</TabsTrigger> : null}
        </TabsList>

        {isStaff ? (
          <TabsContent value="queue" className="mt-6 space-y-6">
            {[
              ["Awaiting preparation", data.awaitingPreparation],
              ["Awaiting review", data.awaitingReview],
              ["Awaiting approval", data.awaitingApproval],
              ["Ready to publish", data.readyToPublish],
              ["Manager challenges", data.challenges],
            ].map(([title, rows]: any) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{(rows ?? []).length} item(s)</CardDescription>
                </CardHeader>
                <CardContent>
                  {(rows ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing waiting.</p>
                  ) : (
                    (rows as any[]).map((r) => (
                      <ReportRow
                        key={r.id}
                        report={r}
                        onOpen={() => setOpenId(r.id)}
                        actions={
                          <>
                            {r.status === "draft" ? (
                              <Button
                                size="sm"
                                onClick={() =>
                                  decideMutation.mutate({ reportId: r.id, to: "prepared" })
                                }
                              >
                                Mark prepared
                              </Button>
                            ) : null}
                            {r.status === "prepared" ? (
                              <Button
                                size="sm"
                                onClick={() => decideMutation.mutate({ reportId: r.id, to: "review" })}
                              >
                                Review
                              </Button>
                            ) : null}
                            {r.status === "review" ? (
                              <Button
                                size="sm"
                                onClick={() =>
                                  decideMutation.mutate({ reportId: r.id, to: "approved" })
                                }
                              >
                                Approve
                              </Button>
                            ) : null}
                            {r.status === "approved" ? (
                              <Button
                                size="sm"
                                onClick={() =>
                                  decideMutation.mutate({ reportId: r.id, to: "published" })
                                }
                              >
                                Publish
                              </Button>
                            ) : null}
                          </>
                        }
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Open reporting exceptions</CardTitle>
                <CardDescription>
                  Blocking exceptions stop publication until they are explained or resolved.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.exceptions ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open exceptions.</p>
                ) : (
                  (data.exceptions as any[]).map((e) => (
                    <div key={e.id} className="flex items-start justify-between gap-3 text-sm">
                      <span>{e.detail}</span>
                      <Badge className={SEVERITY_TONE[e.severity] ?? "bg-muted"}>
                        {label(e.severity)}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="published" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statements</CardTitle>
              <CardDescription>
                {isStaff
                  ? "Published and superseded statements, with their amendment history."
                  : "Open a statement to see its lines and the period it covers."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing published yet.</p>
              ) : (
                reports
                  .filter((r) => (isStaff ? ["published", "superseded"].includes(r.status) : true))
                  .map((r) => (
                    <ReportRow
                      key={r.id}
                      report={r}
                      onOpen={() => setOpenId(r.id)}
                      actions={
                        isStaff && r.status === "published" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              amendMutation.mutate({
                                reportId: r.id,
                                reason: note.trim() || "Amended after further accounting activity",
                              })
                            }
                          >
                            Amend
                          </Button>
                        ) : null
                      }
                    />
                  ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isStaff ? (
          <TabsContent value="prepare" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prepare a reporting period</CardTitle>
                <CardDescription>
                  Drafts the full statement set for the period and records every source it used.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <Input placeholder="Fund" value={fundId} onChange={(e) => setFundId(e.target.value)} />
                  <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                  <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(data.funds ?? []).map((f: any) => (
                    <Button key={f.id} size="sm" variant="outline" onClick={() => setFundId(f.id)}>
                      {f.name}
                    </Button>
                  ))}
                </div>
                <Button
                  disabled={!fundId || prepareMutation.isPending}
                  onClick={() => prepareMutation.mutate({ fundId, periodStart, periodEnd })}
                >
                  Prepare statements
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="workpapers" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workpapers</CardTitle>
              <CardDescription>
                {isStaff
                  ? "Built from source records — no spreadsheets. A second person signs each one off."
                  : "Workpapers Harmonious has shared with you."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Fund" value={fundId} onChange={(e) => setFundId(e.target.value)} />
                {isStaff ? (
                  <Button
                    variant="outline"
                    disabled={!fundId || workpaperMutation.isPending}
                    onClick={() => workpaperMutation.mutate({ fundId, periodStart, periodEnd })}
                  >
                    Rebuild for this period
                  </Button>
                ) : null}
              </div>
              {((workpapers.data as any[]) ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {fundId ? "No workpapers yet." : "Choose a fund to see its workpapers."}
                </p>
              ) : (
                ((workpapers.data as any[]) ?? []).map((w) => (
                  <div
                    key={w.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 text-sm"
                  >
                    <span className="capitalize">
                      {label(w.kind)} · {w.period_end}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge className={STATUS_TONE[w.status] ?? "bg-muted"}>{label(w.status)}</Badge>
                      {isStaff && w.status !== "approved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            signOffMutation.mutate({
                              workpaperId: w.id,
                              to: w.status === "draft" ? "prepared" : w.status === "prepared" ? "review" : "approved",
                            })
                          }
                        >
                          {w.status === "review" ? "Sign off" : "Advance"}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isStaff ? (
          <TabsContent value="close" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Period close checklist</CardTitle>
                <CardDescription>
                  Blocking items must be complete before statements can be published.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {((checklist.data as any[]) ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Choose a fund and period end to build the checklist.
                  </p>
                ) : (
                  ((checklist.data as any[]) ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 text-sm"
                    >
                      <span>
                        {item.label}
                        {item.blocking ? " · blocking" : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge className={item.status === "complete" ? STATUS_TONE['published'] : "bg-muted"}>
                          {label(item.status)}
                        </Badge>
                        {item.status !== "complete" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              checklistMutation.mutate({ itemId: item.id, status: "complete" })
                            }
                          >
                            Mark done
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>

      {openId && detail.data ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base capitalize">
              {label((detail.data as any).report.report_type)} · v{(detail.data as any).report.version}
            </CardTitle>
            <CardDescription>
              {(detail.data as any).report.period_start} to {(detail.data as any).report.period_end} ·{" "}
              {(detail.data as any).report.basis} basis · mapping v
              {(detail.data as any).report.mapping_version}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              {((detail.data as any).lines ?? []).map((line: any) => (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => setLineKey(line.line_key)}
                  className="flex w-full items-baseline justify-between gap-4 border-b border-border/60 py-1.5 text-left text-sm"
                >
                  <span className="text-muted-foreground">{line.label}</span>
                  <span>{money(line.amount_cents)}</span>
                </button>
              ))}
            </div>

            {lineKey && provenance.data ? (
              <div className="rounded-md border border-border/60 p-3 text-xs">
                <p className="font-medium">Where this number comes from</p>
                <p className="mt-1 text-muted-foreground">
                  {((provenance.data as any).accounts ?? []).length} ledger account(s),{" "}
                  {((provenance.data as any).entries ?? []).length} posted journal entr(ies),{" "}
                  {((provenance.data as any).reconciliations ?? []).length} bank reconciliation(s).
                </p>
              </div>
            ) : null}

            {!isStaff && ["published", "superseded"].includes((detail.data as any).report.status) ? (
              <div className="space-y-2">
                <Textarea
                  placeholder="If something looks wrong, describe it here."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      respondMutation.mutate({ reportId: openId, response: "acknowledged" })
                    }
                  >
                    Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      respondMutation.mutate({ reportId: openId, response: "challenged", note })
                    }
                  >
                    Raise a challenge
                  </Button>
                </div>
              </div>
            ) : null}

            {((detail.data as any).closeBlockers ?? []).length > 0 ? (
              <p className="text-xs text-amber-700">
                Outstanding close items: {((detail.data as any).closeBlockers as string[]).join(", ")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
