import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { MigrationsTabs } from "@/components/migrations-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { approveMigrationRequest, declineMigrationRequest, listMigrationRequests } from "@/lib/migration-requests.functions";

export const Route = createFileRoute("/_authenticated/ops/fund-migration_/requests")({
  head: () => ({
    meta: [
      { title: "Migrations approval queue - Harmonious Operations" },
      { name: "description", content: "Approve funds coming from Wix, Google Drive or client requests before they join the full fund list." },
      { property: "og:title", content: "Migrations approval queue - Harmonious Operations" },
      { property: "og:description", content: "Second-person approval for fund migrations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestsPage,
});

const SOURCE = { wix: "Wix", drive: "Google Drive", client: "Client request" } as const;

function RequestsPage() {
  const list = useServerFn(listMigrationRequests);
  const q = useQuery({ queryKey: ["migration-requests"], queryFn: () => list() });
  const [tab, setTab] = useState<"pending" | "approved" | "declined">("pending");
  const rows = (q.data ?? []).filter((r) => r.status === tab);
  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">Migrations</h1>
      <MigrationsTabs />
      <p className="text-sm text-muted-foreground">Funds from Wix, Google Drive gaps and client requests wait here. A different staff member approves each one. Approval adds the fund to the full fund list as a closed draft. Wix investors come in as earlier subscriptions that still need a second person to confirm. Nothing is emailed and no money moves.</p>
      <div className="flex gap-2">{(["pending", "approved", "declined"] as const).map((t) => <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>{t === "pending" ? "Waiting" : t === "approved" ? "Approved" : "Declined"} ({(q.data ?? []).filter((r) => r.status === t).length})</Button>)}</div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing here. Send funds from the Wix funds or Google Drive gaps tabs.</p>}
      {rows.map((r) => <RequestCard key={r.id} r={r} />)}
    </main>
  );
}

function RequestCard({ r }: { r: Awaited<ReturnType<typeof listMigrationRequests>>[number] }) {
  const approve = useServerFn(approveMigrationRequest);
  const decline = useServerFn(declineMigrationRequest);
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["migration-requests"] }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const d = r.details as any;
  return (
    <Card><CardContent className="space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{r.fundName}</p><p className="text-xs text-muted-foreground">{SOURCE[r.source]}{r.clientName ? ` · ${r.clientName}` : ""} · sent by {r.requestedByName} on {new Date(r.createdAt).toLocaleDateString()}</p></div>
        <Badge variant="secondary">{SOURCE[r.source]}</Badge>
      </div>
      {r.notes && <p className="text-muted-foreground">{r.notes}</p>}
      {d?.recordsLink && <p className="text-xs">Records: <a className="text-primary underline" href={d.recordsLink} target="_blank" rel="noreferrer">{d.recordsLink}</a></p>}
      {d?.investorCount != null && <p className="text-xs text-muted-foreground">About {d.investorCount} investors</p>}
      {r.status === "pending" ? (
        <div className="space-y-2 border-t pt-2">
          <Textarea placeholder="Note (needed to decline, or for a Super Admin approving their own)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => act(() => approve({ data: { id: r.id, note } }), "Approved and added as a closed draft")}>{busy ? "Working…" : "Approve"}</Button>
            <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => act(() => decline({ data: { id: r.id, note } }), "Declined")}>Decline</Button>
          </div>
        </div>
      ) : (
        <div className="border-t pt-2 text-xs text-muted-foreground">
          {r.status === "approved" ? "Approved" : "Declined"} by {r.decidedByName} {r.decidedAt ? new Date(r.decidedAt).toLocaleString() : ""}{r.decisionNote ? ` · ${r.decisionNote}` : ""}
          {r.offeringId && <> · <Link className="text-primary underline" to="/admin/fund/$fundId" params={{ fundId: r.offeringId }}>Open fund</Link></>}
          {r.importSummary && <p>{r.importSummary.created} investors recorded as earlier subscriptions{r.importSummary.skipped?.length ? `; ${r.importSummary.skipped.length} skipped: ${r.importSummary.skipped.slice(0, 8).map((s: any) => `${s.name} (${s.reason})`).join(", ")}` : ""}</p>}
        </div>
      )}
    </CardContent></Card>
  );
}
