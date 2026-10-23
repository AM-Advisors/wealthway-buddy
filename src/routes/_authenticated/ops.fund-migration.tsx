import { MigrationsTabs } from "@/components/migrations-tabs";
import { QueueMigrationButton } from "@/components/queue-migration-button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getFundMigrationHistory, getFundMigrationRegistry, recordFundMigrationDecision } from "@/lib/fund-migration-registry.functions";
import { allowedDecisions, DECISION_LABELS, DIMENSIONS, type DecisionKind, type RegistryRow } from "@/lib/fund-migration-registry";

export const Route = createFileRoute("/_authenticated/ops/fund-migration")({
  head: () => ({
    meta: [
      { title: "Fund Migration | Harmonious Operations" },
      { name: "description", content: "Registry of discovered historical funds, match review, duplicates, relationships and migration completeness." },
      { property: "og:title", content: "Fund Migration | Harmonious Operations" },
      { property: "og:description", content: "Review and prioritize historical funds before any import." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FundMigrationPage,
});

const STATUS_LABEL: Record<RegistryRow["status"], string> = {
  matched: "Already in Harmonious", missing: "Missing", archived: "Archived", duplicate: "Possible duplicate", review: "Needs review", not_a_fund: "Not a fund",
};

function FundMigrationPage() {
  const get = useServerFn(getFundMigrationRegistry);
  const q = useQuery({ queryKey: ["fund-migration"], queryFn: () => get() });
  const [status, setStatus] = useState("queue");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<RegistryRow | null>(null);

  const rows = useMemo(() => {
    const all = q.data?.rows ?? [];
    return all.filter((r) => {
      if (status === "queue" && (r.isTest || ["archived", "not_a_fund"].includes(r.status))) return false;
      if (status === "tax" && !(r.status === "missing" && r.hasTaxFolder)) return false;
      if (status === "test" && !r.isTest) return false;
      if (!["queue", "tax", "test", "all"].includes(status) && r.status !== status) return false;
      return !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.parent ?? "").toLowerCase().includes(search.toLowerCase());
    });
  }, [q.data, status, search]);

  const m = q.data?.metrics;
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="font-heading text-2xl font-semibold">Migrations</h1></div><MigrationsTabs />
        <p className="text-sm text-muted-foreground">Every fund and company found in the Harmonious Google Drive folders. Reviewing here records decisions only. It never creates, changes, merges or deletes a fund, investor or investment.</p>
      </header>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {m && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {([["Discovered", m.total, "all"], ["Already matched", m.matched, "matched"], ["Missing", m.missing, "missing"], ["Missing with tax folders", m.missingWithTax, "tax"], ["Archived", m.archived, "archived"], ["Possible duplicates", m.duplicates, "duplicate"], ["Manual review", m.review, "review"]] as const).map(([l, v, s]) => (
          <button key={l} onClick={() => setStatus(s)} className={`rounded-xl border bg-card p-3 text-left transition hover:border-primary ${status === s ? "border-primary" : ""}`}>
            <p className="text-xs text-muted-foreground">{l}</p><p className="font-heading text-2xl font-semibold">{v}</p>
          </button>
        ))}
      </div>}
      {q.data && q.data.harmoniousDuplicates.length > 0 && (
        <Card className="border-accent"><CardContent className="p-4 text-sm">
          <p className="font-medium">Duplicate records inside Harmonious</p>
          {q.data.harmoniousDuplicates.map((d) => <p key={d.name} className="text-muted-foreground">{d.name} appears {d.count} times. Resolve it in Fund Duplicate Review. Nothing is merged automatically.</p>)}
        </CardContent></Card>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-60" aria-label="Show"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="queue">Prioritized migration queue</SelectItem>
            <SelectItem value="tax">Missing with tax folders</SelectItem>
            <SelectItem value="all">All discovered records</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            <SelectItem value="test">Test and demo funds</SelectItem>
          </SelectContent>
        </Select>
        <Input className="max-w-xs" placeholder="Search name or parent" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <span className="text-sm text-muted-foreground">{rows.length} shown</span>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Fund or entity</TableHead><TableHead>Status</TableHead><TableHead>Found in</TableHead><TableHead>Completeness</TableHead><TableHead>Next blocker</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.key} className="cursor-pointer" onClick={() => setOpen(r)}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="max-w-md">
                  <p className="font-medium">{r.name}</p>
                  {r.parent && <p className="text-xs text-muted-foreground">Series of {r.parent}</p>}
                  {r.isTest && <Badge variant="outline" className="mt-1">Test / demo - not a client fund</Badge>}
                </TableCell>
                <TableCell><Badge variant={r.status === "matched" ? "default" : "secondary"}>{STATUS_LABEL[r.status]}</Badge>{r.latest && <p className="mt-1 text-xs text-muted-foreground">{DECISION_LABELS[r.latest.decision]}</p>}</TableCell>
                <TableCell className="text-xs">{[...new Set(r.sources.map((s) => s.root))].join(", ")}</TableCell>
                <TableCell className="w-36"><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${r.score}%` }} /></div><p className="mt-1 text-xs">{r.score}%</p></TableCell>
                <TableCell className="max-w-xs text-xs text-muted-foreground">{r.blockers[0] ?? "None"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {open && <RecordDialog row={open} all={q.data?.rows ?? []} onClose={() => setOpen(null)} />}
    </main>
  );
}

function RecordDialog({ row, all, onClose }: { row: RegistryRow; all: RegistryRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const hist = useServerFn(getFundMigrationHistory);
  const save = useServerFn(recordFundMigrationDecision);
  const h = useQuery({ queryKey: ["fund-migration-history", row.key], queryFn: () => hist({ data: { key: row.key } }) });
  const options = allowedDecisions(row.status);
  const [decision, setDecision] = useState<DecisionKind>(options[0]!);
  const [reason, setReason] = useState("");
  const [parentKey, setParentKey] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await save({ data: { key: row.key, decision, reason, parentKey: decision === "set_parent" ? parentKey : null } });
      toast.success("Decision recorded");
      await qc.invalidateQueries({ queryKey: ["fund-migration"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{row.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <section>
            <p className="font-medium">Drive record compared with Harmonious</p>
            <p className="text-muted-foreground">Harmonious match: {row.matchedName ?? "none"}{row.matchedName && (row.matchApproved ? " (approved)" : " (not yet approved)")}</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">{row.sources.map((s, i) => <li key={i}>{s.root} › {s.folder}</li>)}</ul>
            <p className="mt-1 text-xs text-muted-foreground">Provenance: Drive folder names and file counts only. No file contents were read.</p>
          </section>
          <section>
            <p className="font-medium">Migration completeness: {row.score}%</p>
            <ul className="mt-1 space-y-1">{DIMENSIONS.map(([k, l]) => (
              <li key={k} className="flex gap-2"><Badge variant={row.dims[k].status === "verified" ? "default" : "outline"} className="shrink-0">{row.dims[k].status === "verified" ? "Verified" : row.dims[k].status === "blocked" ? "Blocked" : "Missing"}</Badge><span><b>{l}:</b> {row.dims[k].note}</span></li>
            ))}</ul>
          </section>
          <section className="space-y-2 border-t pt-3">
            {row.status === "missing" && <QueueMigrationButton source="drive" sourceRef={row.key} fundName={row.name} />}
            <p className="font-medium">Record a review decision</p>
            <Select value={decision} onValueChange={(v) => setDecision(v as DecisionKind)}>
              <SelectTrigger aria-label="Decision"><SelectValue /></SelectTrigger>
              <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{DECISION_LABELS[o]}</SelectItem>)}</SelectContent>
            </Select>
            {decision === "set_parent" && (
              <Select value={parentKey} onValueChange={setParentKey}>
                <SelectTrigger aria-label="Parent"><SelectValue placeholder="Choose parent company or master entity" /></SelectTrigger>
                <SelectContent>{all.filter((r) => r.key !== row.key && (r.status === "review" || r.status === "not_a_fund" || /master|management|ventures|capital|holdings/i.test(r.name))).map((r) => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Textarea placeholder="Reason (required, kept permanently)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">This records a decision only. Creating or changing a production fund, entity or investor needs a separate approved import.</p>
            <Button disabled={busy || reason.trim().length < 3 || (decision === "set_parent" && !parentKey)} onClick={submit}>Record decision</Button>
          </section>
          <section className="border-t pt-3">
            <p className="font-medium">History</p>
            {(h.data ?? []).length === 0 ? <p className="text-muted-foreground">No decisions yet.</p> : (h.data ?? []).map((d, i) => (
              <p key={i} className="text-muted-foreground">{new Date(d.created_at).toLocaleString()} · {DECISION_LABELS[d.decision]} · {d.reason}</p>
            ))}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
