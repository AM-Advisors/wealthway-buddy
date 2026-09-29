import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  compareFundDuplicatesFn, completeKeepSeparateFn, confirmConsolidationFn, decideFundDuplicateFn, previewConsolidationFn,
} from "@/lib/fund-duplicate-resolution.functions";
import { DECISION_LABELS, type ConflictKind, type Decision, type FundSnapshot } from "@/lib/fund-duplicate-resolution";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  needs_review: "Needs Further Review",
  keep_separate_pending_rename: "Keep Separate — rename required",
  resolved_separate: "Resolved — Separate Funds",
  consolidation_pending: "Awaiting Confirm Consolidation",
  consolidated: "Consolidated",
  failed: "Consolidation failed — nothing moved",
};

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const yn = (b: boolean) => (b ? "Yes" : "No");
const short = (id: string) => id.slice(0, 8);
type Rows = [string, (s: FundSnapshot) => ReactNode][];

function Row({ label, a, b }: { label: string; a: ReactNode; b: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,1fr)_2fr_2fr] gap-2 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words text-foreground">{a ?? "—"}</span>
      <span className="break-words text-foreground">{b ?? "—"}</span>
    </div>
  );
}

function Section({ title, a, b, rows }: { title: string; a: FundSnapshot; b: FundSnapshot; rows: Rows }) {
  return (
    <div>
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {rows.map(([l, f]) => <Row key={l} label={l} a={f(a)} b={f(b)} />)}
    </div>
  );
}

const SECTIONS: [string, Rows][] = [
  ["Identity", [
    ["Fund ID", (s) => <code className="text-xs">{s.id}</code>], ["Fund Name", (s) => s.name], ["Legal Name", (s) => s.legalName],
    ["Client", (s) => s.clientName], ["Fund type", (s) => s.fundType], ["Created", (s) => s.createdAt?.slice(0, 10)],
    ["Created by", (s) => (s.createdBy ? short(s.createdBy) : null)], ["Status", (s) => s.status],
  ]],
  ["Entity", [
    ["Entity type", (s) => s.entity.entityType], ["Jurisdiction", (s) => s.entity.jurisdiction],
    ["EIN on file", (s) => yn(s.entity.einOnFile)], ["EIN letter on file", (s) => yn(s.entity.einLetterOnFile)],
    ["Formation", (s) => s.entity.formationStep ?? s.entity.dateFormed],
  ]],
  ["Investors", [
    ["Persons", (s) => s.investors.persons], ["Investments", (s) => s.investors.investments], ["Active", (s) => s.investors.active],
    ["Removed / withdrawn", (s) => s.investors.removed], ["Funded", (s) => s.investors.funded], ["Closed", (s) => s.investors.closed],
  ]],
  ["Capital", [["Subscribed", (s) => money(s.capital.subscribedCents)], ["Reconciled funded", (s) => money(s.capital.reconciledFundedCents)]]],
  ["Documents", [
    ["Offering Documents", (s) => s.documents.offeringDocuments], ["Versions", (s) => s.documents.versions],
    ["Investor executed", (s) => s.documents.executed], ["Historical / imported", (s) => s.documents.historical],
  ]],
  ["Banking", [["Banking setup", (s) => yn(s.banking.exists)], ["Current version", (s) => s.banking.currentVersion], ["Verification", (s) => s.banking.verification]]],
  ["Operations", [
    ["Readiness records", (s) => s.operations.readinessRecords], ["Open work items", (s) => s.operations.workItems],
    ["Regulatory configuration", (s) => yn(s.operations.regulatoryConfig)], ["Form D", (s) => s.operations.formD],
    ["Blue Sky", (s) => s.operations.blueSky], ["Tax classification", (s) => s.operations.taxClassification],
  ]],
  ["External / integration references", [
    ["Drive folders", (s) => s.external.driveFolders], ["E-sign references", (s) => s.external.eSignReferences],
    ["Provider references", (s) => s.external.providerReferences], ["Integration events", (s) => s.external.integrationEvents],
    ["All linked records", (s) => s.dependencies.reduce((n, d) => n + d.count, 0)],
  ]],
];

export function FundDuplicateComparison({ fundIds, onClose }: { fundIds: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const compare = useServerFn(compareFundDuplicatesFn);
  const decide = useServerFn(decideFundDuplicateFn);
  const complete = useServerFn(completeKeepSeparateFn);
  const q = useQuery({ queryKey: ["fund-dup-compare", ...fundIds], queryFn: () => compare({ data: { fundIds } }) });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [canonical, setCanonical] = useState<string | null>(null);
  const [ack, setAck] = useState<ConflictKind[]>([]);
  const [note, setNote] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fund-duplicates"] });
    qc.invalidateQueries({ queryKey: ["fund-dup-compare"] });
    qc.invalidateQueries({ queryKey: ["fund-dup-impact"] });
  };

  const save = useMutation({
    mutationFn: () => decide({ data: { fundIds, decision: decision!, canonicalId: decision === "same_fund" ? canonical : null, note, acknowledged: ack } }),
    onSuccess: () => { toast.success("Decision recorded"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const finish = useMutation({
    mutationFn: (reviewId: string) => complete({ data: { reviewId } }),
    onSuccess: () => { toast.success("Resolved as separate Funds"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading comparison…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const { funds, conflicts, facts, review } = q.data!;
  const [a, b] = funds as [FundSnapshot, FundSnapshot];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Resolve Duplicate Fund</CardTitle>
          <CardDescription>Factual comparison only. No record is selected for you.</CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <div className="min-w-[36rem]">
            <Row label="" a={<strong>Record A</strong>} b={<strong>Record B</strong>} />
            {SECTIONS.map(([t, rows]) => <Section key={t} title={t} a={a} b={b} rows={rows} />)}
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          {facts.map((f) => <p key={f}>{f}</p>)}
        </div>

        {conflicts.map((c) => (
          <div key={c.kind} className="rounded-md border border-destructive/40 p-3 text-sm">
            <p className="font-medium text-destructive">Conflict — Harmonious Decision Required: {c.label}</p>
            <p className="text-muted-foreground">{c.detail}{c.blocking ? " Must be resolved at the source before consolidation." : ""}</p>
            {!c.blocking && (
              <label className="mt-2 flex items-center gap-2 text-xs">
                <Checkbox checked={ack.includes(c.kind)} onCheckedChange={(v) => setAck((p) => (v ? [...p, c.kind] : p.filter((k) => k !== c.kind)))} />
                Reviewed — the Canonical Fund's value stands
              </label>
            )}
          </div>
        ))}

        {review && (
          <p className="text-sm">
            Current status: <Badge variant="outline">{STATUS_LABELS[review.status]}</Badge>
            {review.failureMessage ? <span className="ml-2 text-destructive">{review.failureMessage}</span> : null}
          </p>
        )}

        {review?.status !== "consolidated" && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Decision</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DECISION_LABELS) as Decision[]).map((d) => (
                <Button key={d} size="sm" variant={decision === d ? "default" : "outline"} onClick={() => setDecision(d)}>{DECISION_LABELS[d]}</Button>
              ))}
            </div>
            {decision === "same_fund" && (
              <div className="space-y-1">
                <Label>Canonical Fund (required)</Label>
                <div className="flex flex-wrap gap-2">
                  {[a, b].map((s, i) => (
                    <Button key={s.id} size="sm" variant={canonical === s.id ? "default" : "outline"} onClick={() => setCanonical(s.id)}>
                      Record {i ? "B" : "A"} · {short(s.id)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {decision === "different_funds" && (
              <p className="text-xs text-muted-foreground">Rename one Fund to a genuinely unique name before this is complete. Its Legal Name stays unchanged.</p>
            )}
            <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" disabled={!decision || (decision === "same_fund" && !canonical) || save.isPending} onClick={() => save.mutate()}>Record decision</Button>
          </div>
        )}

        {review?.status === "keep_separate_pending_rename" && (
          <Button size="sm" variant="outline" onClick={() => finish.mutate(review.id)}>Check names and complete</Button>
        )}
        {review && review.decision === "same_fund" && review.status !== "consolidated" && review.canonicalId && review.duplicateId && (
          <ImpactPanel reviewId={review.id} version={review.version} canonicalId={review.canonicalId} duplicateId={review.duplicateId} onDone={refresh} />
        )}
      </CardContent>
    </Card>
  );
}

function ImpactPanel({ reviewId, version, canonicalId, duplicateId, onDone }: { reviewId: string; version: number; canonicalId: string; duplicateId: string; onDone: () => void }) {
  const preview = useServerFn(previewConsolidationFn);
  const confirm = useServerFn(confirmConsolidationFn);
  const q = useQuery({ queryKey: ["fund-dup-impact", reviewId, version], queryFn: () => preview({ data: { reviewId } }) });
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => confirm({ data: { reviewId, canonicalId, duplicateId, reason, confirmed: true, version } }),
    onSuccess: () => { toast.success("Consolidated"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Preparing impact report…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const { report, blockers } = q.data!;
  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-sm">
      <p className="font-medium">Pre-merge impact report</p>
      <p><span className="text-muted-foreground">Keep:</span> <code className="text-xs">{report.keep.canonicalId}</code></p>
      <div>
        <p className="text-muted-foreground">Move / Reassociate — {report.totals.move} record(s)</p>
        <ul className="ml-4 list-disc">{report.move.map((x) => <li key={x.table + x.column}>{x.table}: {x.count}</li>)}</ul>
      </div>
      <div>
        <p className="text-muted-foreground">Preserve with original Fund ID — {report.totals.preserve} record(s)</p>
        <ul className="ml-4 list-disc">{report.preserve.map((x) => <li key={x.table + x.column}>{x.table}: {x.count}</li>)}</ul>
      </div>
      <p className="text-muted-foreground">Funded/closed Investments reassociated unchanged: {report.protectedInvestments}. The retired ID becomes a permanent alias.</p>
      {blockers.length > 0 && <ul className="ml-4 list-disc text-destructive">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <Textarea placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <label className="flex items-center gap-2"><Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />I have reviewed the impact report.</label>
      <Button size="sm" variant="destructive" disabled={blockers.length > 0 || !confirmed || reason.trim().length < 5 || m.isPending} onClick={() => m.mutate()}>Confirm Consolidation</Button>
    </div>
  );
}
