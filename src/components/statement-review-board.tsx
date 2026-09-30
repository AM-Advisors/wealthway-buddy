import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { openStatement } from "@/components/capital-statement-panel";
import { EmptyState } from "@/components/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  decideReviewMemoFn, decideStatementFn, listReviewMemosFn, memoFiguresFn, notifyReviewMemoFn,
  notifyStatementsFn, saveReviewMemoFn, statementReviewQueueFn,
} from "@/lib/statement-review.functions";
import { money } from "@/lib/status";

const STATUS: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  draft: { label: "Awaiting review", variant: "outline" },
  approved: { label: "Approved", variant: "secondary" },
  returned: { label: "Returned", variant: "destructive" },
};
const REPORT_LABEL: Record<string, string> = {
  balance_sheet: "Balance sheet", income_statement: "Income statement", capital_activity: "Capital activity",
  partners_capital: "Partners' capital", cash_flow: "Cash flows", schedule_of_investments: "Schedule of investments",
};

function errMsg(e: unknown) { return e instanceof Error ? e.message : "Something went wrong."; }

export function StatementReviewBoard() {
  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl">Statements & reviews</h1>
        <p className="text-sm text-muted-foreground">Capital account statements are drafted automatically when an investor closes. A second Harmonious person approves each one before the investor can see it. Emails go out only when you press send.</p>
      </div>
      <Tabs defaultValue="statements">
        <TabsList><TabsTrigger value="statements">Capital account statements</TabsTrigger><TabsTrigger value="reviews">Client financial reviews</TabsTrigger></TabsList>
        <TabsContent value="statements"><StatementQueue /></TabsContent>
        <TabsContent value="reviews"><ReviewMemos /></TabsContent>
      </Tabs>
    </section>
  );
}

function StatementQueue() {
  const qc = useQueryClient();
  const load = useServerFn(statementReviewQueueFn);
  const decide = useServerFn(decideStatementFn);
  const notify = useServerFn(notifyStatementsFn);
  const q = useQuery({ queryKey: ["statement-review"], queryFn: () => load(), retry: false });
  const [returning, setReturning] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["statement-review"] });
  const decideM = useMutation({
    mutationFn: (v: { statementId: string; decision: "approved" | "returned"; note?: string }) => decide({ data: v }),
    onSuccess: (_r, v) => { toast.success(v.decision === "approved" ? "Statement approved — the investor can now see it." : "Statement returned."); setReturning(null); setNote(""); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const notifyM = useMutation({
    mutationFn: (offeringId: string) => notify({ data: { offeringId } }),
    onSuccess: (r) => { toast.success(`Sent ${r.sent} notice${r.sent === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped` : ""}.`); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isPending) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;
  if (q.isError) return <EmptyState>{errMsg(q.error)}</EmptyState>;
  if (!q.data.funds.length) return <EmptyState>No capital account statements yet. They are drafted when an investor's closing is confirmed.</EmptyState>;

  return (
    <div className="space-y-4 pt-3">
      {q.data.funds.map((f) => (
        <Card key={f.id}>
          <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle className="text-base">{f.name}</CardTitle><CardDescription>{f.drafts} awaiting review · {f.statements.length} current statements</CardDescription></div>
            <Button size="sm" variant="outline" disabled={!f.readyToNotify || notifyM.isPending} onClick={() => notifyM.mutate(f.id)}>
              Email {f.readyToNotify} investor{f.readyToNotify === 1 ? "" : "s"} their statement
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {f.statements.map((s) => (
                <li key={s.id} className="space-y-2 py-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{s.investorName} <span className="text-muted-foreground">· v{s.version}</span></p>
                      <p className="text-xs text-muted-foreground">{money(s.contributedCents)} contributed of {money(s.commitmentCents)} · dated {s.statementDate}{s.notifiedAt ? ` · emailed ${new Date(s.notifiedAt).toLocaleDateString()}` : ""}</p>
                      {s.status === "returned" && s.reviewNote ? <p className="text-xs text-destructive">Returned: {s.reviewNote}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS[s.status]?.variant ?? "outline"}>{STATUS[s.status]?.label ?? s.status}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => void openStatement({ ...s, statement_date: s.statementDate, snapshot: s.snapshot })}>View</Button>
                      {s.status === "draft" ? (
                        s.producedByMe ? <span className="text-xs text-muted-foreground">You produced this — another person must review</span> : (
                          <>
                            <Button size="sm" disabled={decideM.isPending} onClick={() => decideM.mutate({ statementId: s.id, decision: "approved" })}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => { setReturning(s.id); setNote(""); }}>Return</Button>
                          </>
                        )
                      ) : null}
                    </div>
                  </div>
                  {returning === s.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change?" aria-label="Return note" />
                      <Button size="sm" variant="destructive" disabled={!note.trim() || decideM.isPending} onClick={() => decideM.mutate({ statementId: s.id, decision: "returned", note })}>Return statement</Button>
                      <Button size="sm" variant="ghost" onClick={() => setReturning(null)}>Cancel</Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type Finding = { area: string; observation: string; action?: string };

function ReviewMemos() {
  const qc = useQueryClient();
  const load = useServerFn(listReviewMemosFn);
  const decide = useServerFn(decideReviewMemoFn);
  const notify = useServerFn(notifyReviewMemoFn);
  const q = useQuery({ queryKey: ["review-memos"], queryFn: () => load({ data: {} }), retry: false });
  const [editing, setEditing] = useState<any | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["review-memos"] });
  const decideM = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "returned"; note?: string }) => decide({ data: v }),
    onSuccess: () => { toast.success("Decision recorded."); setReturning(null); setNote(""); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const notifyM = useMutation({
    mutationFn: (id: string) => notify({ data: { id } }),
    onSuccess: (r) => { toast.success(`Emailed ${r.sent} fund manager${r.sent === 1 ? "" : "s"}.`); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isPending) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;
  if (q.isError) return <EmptyState>{errMsg(q.error)}</EmptyState>;
  const d = q.data;

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">A review memo accompanies the balance sheet, income statement and capital activity for a period. Prepare it here; another Harmonious person approves it; then send the client a notice.</p>
        {!editing ? <Button size="sm" onClick={() => setEditing({})}>New financial review</Button> : null}
      </div>
      {editing ? <MemoEditor funds={d.funds} initial={editing} onDone={() => { setEditing(null); refresh(); }} /> : null}
      {!d.memos.length ? <EmptyState>No financial reviews yet.</EmptyState> : d.memos.map((m) => (
        <Card key={m.id}>
          <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle className="text-base">{m.title}</CardTitle><CardDescription>{m.fundName} · {m.periodStart} to {m.periodEnd}{m.notifiedAt ? ` · client notified ${new Date(m.notifiedAt).toLocaleDateString()}` : ""}</CardDescription></div>
            <Badge variant={STATUS[m.status]?.variant ?? "outline"}>{STATUS[m.status]?.label ?? m.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap">{m.summary}</p>
            {m.findings.length ? (
              <ul className="space-y-1">{m.findings.map((f, i) => <li key={i} className="rounded border p-2"><strong>{f.area}:</strong> {f.observation}{f.action ? <span className="block text-xs text-muted-foreground">Action: {f.action}</span> : null}</li>)}</ul>
            ) : null}
            {m.status === "returned" && m.decisionNote ? <p className="text-xs text-destructive">Returned: {m.decisionNote}</p> : null}
            <div className="flex flex-wrap gap-2">
              {m.status === "draft" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(m)}>Edit</Button>
                  {m.preparedByMe ? <span className="self-center text-xs text-muted-foreground">You prepared this — another person must approve</span> : (
                    <>
                      <Button size="sm" disabled={decideM.isPending} onClick={() => decideM.mutate({ id: m.id, decision: "approved" })}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => { setReturning(m.id); setNote(""); }}>Return</Button>
                    </>
                  )}
                </>
              ) : null}
              {m.status === "approved" && !m.notifiedAt ? <Button size="sm" variant="outline" disabled={notifyM.isPending} onClick={() => notifyM.mutate(m.id)}>Email the fund manager</Button> : null}
            </div>
            {returning === m.id ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change?" aria-label="Return note" />
                <Button size="sm" variant="destructive" disabled={!note.trim()} onClick={() => decideM.mutate({ id: m.id, decision: "returned", note })}>Return memo</Button>
                <Button size="sm" variant="ghost" onClick={() => setReturning(null)}>Cancel</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MemoEditor({ funds, initial, onDone }: { funds: { id: string; name: string }[]; initial: any; onDone: () => void }) {
  const save = useServerFn(saveReviewMemoFn);
  const figures = useServerFn(memoFiguresFn);
  const [offeringId, setOfferingId] = useState<string>(initial.offeringId ?? "");
  const [periodStart, setPeriodStart] = useState<string>(initial.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState<string>(initial.periodEnd ?? "");
  const [title, setTitle] = useState<string>(initial.title ?? "");
  const [summary, setSummary] = useState<string>(initial.summary ?? "");
  const [findings, setFindings] = useState<Finding[]>(initial.findings ?? []);
  const fq = useQuery({
    queryKey: ["memo-figures", offeringId, periodEnd],
    queryFn: () => figures({ data: { offeringId, periodEnd } }),
    enabled: !!offeringId && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd),
    retry: false,
  });
  const reports = fq.data?.reports ?? [];
  const m = useMutation({
    mutationFn: () => save({ data: {
      id: initial.id, offeringId, periodStart, periodEnd, title: title || `Financial review — ${periodEnd}`, summary,
      findings: findings.filter((f) => f.area.trim() && f.observation.trim()), reportIds: reports.map((r) => r.id),
    } }),
    onSuccess: () => { toast.success("Draft saved — ready for a second person to approve."); onDone(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2"><CardTitle className="text-base">{initial.id ? "Edit financial review" : "New financial review"}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>Fund</Label>
            <Select value={offeringId} onValueChange={setOfferingId}>
              <SelectTrigger><SelectValue placeholder="Choose a fund" /></SelectTrigger>
              <SelectContent>{funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="ps">Period start</Label><Input id="ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="pe">Period end</Label><Input id="pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">Statements included</p>
          {!offeringId || !periodEnd ? <p className="text-muted-foreground">Choose a fund and period end to attach its approved statements.</p>
            : fq.isPending ? <p className="text-muted-foreground">Looking up statements…</p>
            : reports.length ? <ul className="mt-1 flex flex-wrap gap-2">{reports.map((r) => <li key={r.id}><Badge variant="secondary">{REPORT_LABEL[r.type] ?? r.type} v{r.version} · {r.status}</Badge></li>)}</ul>
            : <p className="text-muted-foreground">No approved balance sheet, income statement or capital activity for this period yet. Prepare them in Financial reporting first; you can still draft the memo.</p>}
        </div>
        <div className="space-y-1"><Label htmlFor="mt">Title</Label><Input id="mt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q3 2026 financial review" /></div>
        <div className="space-y-1"><Label htmlFor="ms">Review summary</Label><Textarea id="ms" rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Overall results, notable movements in assets, income and partners' capital, and anything the client should know." /></div>
        <div className="space-y-2">
          <Label>Findings</Label>
          {findings.map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
              <Input value={f.area} onChange={(e) => setFindings(findings.map((x, j) => j === i ? { ...x, area: e.target.value } : x))} placeholder="Area" aria-label="Area" />
              <Input value={f.observation} onChange={(e) => setFindings(findings.map((x, j) => j === i ? { ...x, observation: e.target.value } : x))} placeholder="Observation" aria-label="Observation" />
              <Input value={f.action ?? ""} onChange={(e) => setFindings(findings.map((x, j) => j === i ? { ...x, action: e.target.value } : x))} placeholder="Recommended action (optional)" aria-label="Action" />
              <Button size="sm" variant="ghost" onClick={() => setFindings(findings.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setFindings([...findings, { area: "", observation: "" }])}>Add finding</Button>
        </div>
        <div className="flex gap-2">
          <Button disabled={!offeringId || !periodStart || !periodEnd || m.isPending} onClick={() => m.mutate()}>Save draft</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Fund manager view: approved reviews for their funds. */
export function ManagerReviewMemos() {
  const load = useServerFn(listReviewMemosFn);
  const q = useQuery({ queryKey: ["review-memos", "manager"], queryFn: () => load({ data: {} }), retry: false });
  if (q.isPending || q.isError || !q.data.memos.length) return null;
  return (
    <section className="mx-auto max-w-6xl space-y-3 px-4 pt-6 sm:px-6">
      <h2 className="text-lg">Financial reviews from Harmonious</h2>
      {q.data.memos.map((m) => (
        <Card key={m.id}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{m.title}</CardTitle><CardDescription>{m.fundName} · {m.periodStart} to {m.periodEnd}</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="whitespace-pre-wrap">{m.summary}</p>
            {m.findings.length ? <ul className="space-y-1">{m.findings.map((f, i) => <li key={i} className="rounded border p-2"><strong>{f.area}:</strong> {f.observation}{f.action ? <span className="block text-xs text-muted-foreground">Recommended: {f.action}</span> : null}</li>)}</ul> : null}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
