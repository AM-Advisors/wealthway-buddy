import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/crm-model";
import {
  getDealMigrationStatus, reconcileDealMigration, runDealMigrationBatch, setDealStageMapping, startDealMigrationRun, stopDealMigrationRun,
} from "@/lib/hubspot-deal-migration.functions";

export const Route = createFileRoute("/_authenticated/ops/hubspot-deals")({
  head: () => ({
    meta: [
      { title: "HubSpot deal migration — Harmonious" },
      { name: "description", content: "Import every HubSpot deal into Harmonious with stages, owners, contacts, companies and history, then reconcile." },
      { property: "og:title", content: "HubSpot deal migration — Harmonious" },
      { property: "og:description", content: "Batch import, change tracking and reconciliation of HubSpot deals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const COUNT_LABELS: Record<string, string> = {
  deals_created: "Deals added", deals_updated: "Deals updated", deals_conflict: "Changed in Harmonious (kept)", deals_failed: "Deals failed",
  contacts_created: "Contacts added", associations: "Contact/company links", history: "History items", owner_unmatched: "Owner not matched (kept on record)",
};

function Page() {
  const qc = useQueryClient();
  const status = useServerFn(getDealMigrationStatus);
  const start = useServerFn(startDealMigrationRun);
  const batch = useServerFn(runDealMigrationBatch);
  const stop = useServerFn(stopDealMigrationRun);
  const map = useServerFn(setDealStageMapping);
  const rec = useServerFn(reconcileDealMigration);
  const q = useQuery({ queryKey: ["hs-deal-migration"], queryFn: () => status(), retry: false });
  const [running, setRunning] = useState(false);
  const [recon, setRecon] = useState<any>(null);
  const cancel = useRef(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["hs-deal-migration"] });

  async function drive(runId: string) {
    setRunning(true); cancel.current = false;
    let failures = 0;
    try {
      for (let i = 0; i < 200 && !cancel.current; i++) {
        const r: any = await batch({ data: { runId } });
        await refresh();
        if (r.lastBatchFailed) { if (++failures >= 3) { toast.error("Three batches in a row failed. See errors below; press Continue to retry."); break; } }
        else failures = 0;
        if (r.status !== "running") { toast.success("Run finished."); break; }
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Batch failed"); }
    finally { setRunning(false); }
  }
  async function begin(kind: "initial" | "incremental") {
    try { const r: any = await start({ data: { kind } }); await refresh(); await drive(r.id); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start"); }
  }

  if (q.error) return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;
  const d = q.data;
  const open = d?.runs.find((r: any) => r.status === "running");
  const completedInitial = d?.runs.some((r: any) => r.kind === "initial" && r.status === "completed");

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">HubSpot deal migration</h1>
        <p className="text-sm text-muted-foreground">Copies every HubSpot deal, including closed and deleted ones, into Harmonious. HubSpot is only read, never changed. Deals changed in Harmonious after import are never overwritten.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Run</CardTitle><CardDescription>{d ? `${d.importedDeals} HubSpot deals in Harmonious.` : "Loading…"}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {open ? (<>
            <Button disabled={running} onClick={() => drive(open.id)}>Continue {open.kind} run</Button>
            {running && <Button variant="outline" onClick={() => { cancel.current = true; }}>Pause</Button>}
            {!running && <Button variant="ghost" onClick={async () => { await stop({ data: { runId: open.id } }); refresh(); }}>Stop run</Button>}
          </>) : (<>
            <Button disabled={running} onClick={() => begin("initial")}>{completedInitial ? "Re-run full import" : "Start full import"}</Button>
            <Button variant="outline" disabled={running || !completedInitial} onClick={() => begin("incremental")}>Bring in HubSpot changes since last run</Button>
          </>)}
          <Button variant="outline" disabled={running} onClick={async () => { try { setRecon(await rec({})); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Reconcile with HubSpot</Button>
        </CardContent>
      </Card>

      {recon && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base">Reconciliation <Badge variant={recon.ok ? "default" : "destructive"}>{recon.ok ? "Matches" : "Differences found"}</Badge></CardTitle>
            <CardDescription>{new Date(recon.at).toLocaleString()}{recon.note ? ` · ${recon.note}` : ""}</CardDescription></CardHeader>
          <CardContent>
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Check</th><th className="text-right">HubSpot</th><th className="text-right">Harmonious</th><th></th></tr></thead>
              <tbody>{recon.lines.map((l: any) => (
                <tr key={l.check} className="border-t"><td className="py-1">{l.check}</td>
                  <td className="text-right">{l.check.includes("amount") ? `$${(l.hubspot / 100).toLocaleString()}` : l.hubspot}</td>
                  <td className="text-right">{l.check.includes("amount") ? `$${(l.harmonious / 100).toLocaleString()}` : l.harmonious}</td>
                  <td className="pl-2">{l.ok ? "✓" : "✗"}</td></tr>))}</tbody></table>
            {recon.missingInHarmonious.length > 0 && <p className="mt-2 text-xs">Not yet in Harmonious: {recon.missingInHarmonious.slice(0, 30).join(", ")}{recon.missingInHarmonious.length > 30 ? "…" : ""}</p>}
            {recon.amountMismatches.length > 0 && <p className="mt-1 text-xs">Amount differs (usually edited in Harmonious): {recon.amountMismatches.slice(0, 30).join(", ")}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(d?.runs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
          {(d?.runs ?? []).map((r: any) => (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{r.kind === "initial" ? "Full import" : "Changes"}</Badge>
                <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}{r.status === "running" ? ` · ${r.phase}` : ""}</Badge>
                <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()} · {r.batches} batches</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {Object.entries(r.counts ?? {}).map(([k, v]) => <span key={k}>{COUNT_LABELS[k] ?? k.replace(/_/g, " ")}: <b>{String(v)}</b></span>)}
              </div>
              {(r.errors ?? []).length > 0 && (
                <details className="mt-2 text-xs"><summary className="cursor-pointer">{r.errors.length} issues</summary>
                  <ul className="mt-1 max-h-60 space-y-1 overflow-auto">{r.errors.map((e: any, i: number) => <li key={i}><b>{e.kind}</b>{e.hubspotDealId ? ` · deal ${e.hubspotDealId}` : ""}: {e.message}</li>)}</ul>
                </details>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Stage mapping</CardTitle><CardDescription>Each HubSpot stage maps to a Harmonious stage. The original pipeline and stage are always kept on the deal.</CardDescription></CardHeader>
        <CardContent>
          {(d?.stages ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Stages load on the first batch.</p> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>HubSpot pipeline</th><th>HubSpot stage</th><th>Harmonious stage</th></tr></thead>
              <tbody>{d!.stages.map((s: any) => (
                <tr key={s.hs_pipeline_id + s.hs_stage_id} className="border-t"><td className="py-1">{s.pipeline_label}</td><td>{s.stage_label}</td>
                  <td><Select value={s.harmonious_stage} onValueChange={async (v) => { await map({ data: { pipelineId: s.hs_pipeline_id, stageId: s.hs_stage_id, stage: v as any } }); refresh(); toast.success("Mapping saved; applies on the next run."); }}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{DEAL_STAGES.map((x) => <SelectItem key={x} value={x}>{DEAL_STAGE_LABELS[x]}</SelectItem>)}</SelectContent>
                  </Select></td></tr>))}</tbody></table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
