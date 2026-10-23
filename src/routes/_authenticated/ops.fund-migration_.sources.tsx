import { MigrationsTabs } from "@/components/migrations-tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getSourceDecisionHistory, getSourceReconciliation, recordSourceDecision } from "@/lib/source-reconciliation.functions";
import { CLASS_LABEL, DECISION_LABEL, SOURCE_LABEL, STATUS_LABEL, type MatchClass, type ReviewDecision, type SourceCard } from "@/lib/source-reconciliation";

export const Route = createFileRoute("/_authenticated/ops/fund-migration_/sources")({
  head: () => ({
    meta: [
      { title: "Source Reconciliation | Harmonious Operations" },
      { name: "description", content: "Read-only reconciliation of historical records across Harmonious, identity verification, Simplici, Wix, Google Drive and Box." },
      { property: "og:title", content: "Source Reconciliation | Harmonious Operations" },
      { property: "og:description", content: "Match historical source records to Harmonious before any import." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SourcesPage,
});

const tone = (s: SourceCard["status"]) => (s === "connected" ? "default" : s === "partial" ? "secondary" : s === "error" ? "destructive" : "outline") as any;
const DECISIONS: ReviewDecision[] = ["confirm_match", "reject_match", "mark_unresolved", "flag_duplicate", "request_evidence"];

function SourcesPage() {
  const get = useServerFn(getSourceReconciliation);
  const q = useQuery({ queryKey: ["source-reconciliation"], queryFn: () => get() });
  const [cls, setCls] = useState<string>("all");
  const [open, setOpen] = useState<any | null>(null);
  const rows = useMemo(() => (q.data?.didit ?? []).filter((r) => cls === "all" || r.matchClass === cls), [q.data, cls]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1">
        <Link to="/ops/fund-migration" className="text-sm text-muted-foreground hover:underline">Fund Migration</Link>
        <MigrationsTabs />
        <h1 className="font-heading text-2xl font-semibold">Source Reconciliation</h1>
        <p className="text-sm text-muted-foreground">Read-only. Decisions here are recorded for review and never change a person, investment, verification or fund. A historical verification result is not current eligibility.</p>
      </header>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading sources...</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data?.cards ?? []).map((c) => (
          <Card key={c.source}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-heading font-semibold">{SOURCE_LABEL[c.source]}</h2>
                <Badge variant={tone(c.status)}>{STATUS_LABEL[c.status]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{c.note}</p>
              {c.counts ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {([["Records", c.counts.records], ["Confirmed", c.counts.confirmed], ["Probable", c.counts.probable], ["Unmatched", c.counts.unmatched], ["Conflicting", c.counts.conflicting], ["Missing evidence", c.counts.missingEvidence], ["Errors", c.counts.errors], ["Review required", c.counts.reviewRequired]] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
                  ))}
                </dl>
              ) : <p className="text-xs font-medium">Counts unavailable until connected.</p>}
              <p className="text-[11px] text-muted-foreground">Last inventory: {c.lastInventoryAt ? new Date(c.lastInventoryAt).toLocaleString() : "never"}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Identity verification history</h2>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger className="w-56" aria-label="Filter by match"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classifications</SelectItem>
              {(Object.keys(CLASS_LABEL) as MatchClass[]).map((k) => <SelectItem key={k} value={k}>{CLASS_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Session</TableHead><TableHead>Type</TableHead><TableHead>Latest outcome</TableHead><TableHead>Events</TableHead>
              <TableHead>Last seen</TableHead><TableHead>Classification</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.slice(0, 300).map((r) => (
                <TableRow key={r.ref}>
                  <TableCell className="font-mono text-xs">{r.sessionId}</TableCell>
                  <TableCell className="text-xs">{r.verificationType.replace("_", " ")}</TableCell>
                  <TableCell className="text-xs">{r.latestOutcome ?? "-"}</TableCell>
                  <TableCell className="text-xs">{r.eventCount}</TableCell>
                  <TableCell className="text-xs">{new Date(r.lastSeen).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant={r.matchClass === "confirmed" ? "default" : "outline"}>{CLASS_LABEL[r.matchClass as MatchClass]}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => setOpen(r)}>Review</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length > 300 && <p className="text-xs text-muted-foreground">Showing 300 of {rows.length}. Use the filter to narrow.</p>}
      </section>
      {open && <ReviewDialog row={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function ReviewDialog({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(recordSourceDecision);
  const hist = useServerFn(getSourceDecisionHistory);
  const h = useQuery({ queryKey: ["source-history", row.ref], queryFn: () => hist({ data: { source: "didit", sourceRef: row.ref } }) });
  const [decision, setDecision] = useState<ReviewDecision>("mark_unresolved");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await save({ data: { source: "didit", sourceRef: row.ref, decision, reason } });
      toast.success("Decision recorded. No production record was changed.");
      await qc.invalidateQueries({ queryKey: ["source-reconciliation"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Verification session {row.sessionId}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p><span className="text-muted-foreground">Classification:</span> {CLASS_LABEL[row.matchClass as MatchClass]}</p>
          <p><span className="text-muted-foreground">Linked by:</span> {row.linkedVia ?? "nothing"} · <span className="text-muted-foreground">People found:</span> {row.personIds.length}</p>
          <p><span className="text-muted-foreground">Seen:</span> {new Date(row.firstSeen).toLocaleDateString()} to {new Date(row.lastSeen).toLocaleDateString()}</p>
          {row.missing.length > 0 && <p><span className="text-muted-foreground">Missing:</span> {row.missing.join(", ")}</p>}
          <p className="rounded-md bg-muted p-2 text-xs">{row.action}</p>
          <Select value={decision} onValueChange={(v) => setDecision(v as ReviewDecision)}>
            <SelectTrigger aria-label="Decision"><SelectValue /></SelectTrigger>
            <SelectContent>{DECISIONS.map((d) => <SelectItem key={d} value={d}>{DECISION_LABEL[d]}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button onClick={submit} disabled={busy || reason.trim().length < 3}>Record decision</Button>
          <div className="space-y-1">
            <h3 className="text-xs font-semibold">History</h3>
            {(h.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No decisions yet.</p>}
            {(h.data ?? []).map((d: any, i: number) => (
              <p key={i} className="text-xs">{new Date(d.created_at).toLocaleString()}: {DECISION_LABEL[d.decision as ReviewDecision]}. {d.reason}</p>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
