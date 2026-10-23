import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { useOrgTz } from "@/components/marketing/use-org-tz";
import { fmtInTz } from "@/lib/org-timezone";
import { ALERT_LABEL, HEALTH_LABEL, type Health } from "@/lib/marketing-research-health";
import { getResearchHealth, researchAlertAction, retryResearchIngestion } from "@/lib/marketing-research.functions";

export const Route = createFileRoute("/_authenticated/marketing_/studio_/research_/monitoring")({
  head: mkHead("Research monitoring", "Source health, scheduled job status and alerts for the Harmonious research engine."),
  component: Monitoring,
});

const TONE: Record<Health, string> = {
  healthy: "bg-chart-1/20 text-foreground", stale: "bg-chart-3/25 text-foreground", degraded: "bg-chart-3/25 text-foreground",
  failing: "bg-destructive/15 text-destructive", down: "bg-destructive/25 text-destructive", manual: "bg-muted text-muted-foreground", never_run: "bg-muted text-muted-foreground",
};
const sevCls = (s: string) => s === "critical" ? "border-destructive" : s === "warning" ? "border-chart-3" : "border-border";

function Monitoring() {
  const tz = useOrgTz();
  const load = useServerFn(getResearchHealth), act = useServerFn(researchAlertAction), retry = useServerFn(retryResearchIngestion);
  const q = useQuery({ queryKey: ["research-health"], queryFn: () => load(), refetchInterval: 60000 });
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const d: any = q.data;
  const f = (x: string | null | undefined) => x ? fmtInTz(x, tz) : "—";
  const doRetry = async (source: string | null) => {
    setBusy(source ?? "all");
    try { const r = await retry({ data: { source } }); r.skipped ? toast.info(`Skipped: ${r.skipped}`) : r.errors.length ? toast.error(r.errors.join("; ")) : toast.success(`Retried. ${r.added} new stories.`); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); qc.invalidateQueries({ queryKey: ["research-health"] }); }
  };
  const doAct = async (id: string, action: "acknowledge" | "resolve" | "escalate") => {
    const note = action === "resolve" ? window.prompt("How was it resolved?") : null;
    if (action === "resolve" && !note) return;
    try { await act({ data: { id, action, note } }); toast.success("Updated"); qc.invalidateQueries({ queryKey: ["research-health"] }); } catch (e: any) { toast.error(e.message); }
  };
  const alerts = ((d?.alerts ?? []) as any[]).filter((a) => showResolved || !a.resolved_at);

  return (
    <MkPage title="Research monitoring" intro={`Health of every research source and the hourly job. Failed or unverified sources never produce content. Times in ${tz}.`}
      actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/marketing/studio/research">Research feed</Link></Button>
        {d?.canManage && <Button disabled={!!busy} onClick={() => doRetry(null)}>{busy === "all" ? "Running…" : "Retry all sources"}</Button>}</div>}>
      {!d ? <p className="text-sm text-muted-foreground">{q.error ? (q.error as Error).message : "Loading…"}</p> : <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Last successful run" value={f(d.lastSuccess)} />
          <Stat label="Last run" value={d.lastRun ? `${d.lastRun.status} · ${f(d.lastRun.started_at)}` : "—"} />
          <Stat label="AI processing" value={d.aiPaused ? `Paused: ${d.aiPaused}` : "Available"} bad={!!d.aiPaused} />
          <Stat label="Form D this week" value={`${d.formD.filings} filings · ${d.formD.parseErrors} unreadable`} bad={d.formD.filings > 0 && d.formD.parseErrors / d.formD.filings > 0.5} />
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between"><h2 className="font-heading text-lg">Alerts</h2>
            <label className="text-xs"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label></div>
          {!alerts.length ? <p className="text-sm text-muted-foreground">No open alerts.</p> : alerts.map((a) => (
            <div key={a.id} className={`rounded-md border-l-4 border bg-card p-2 text-sm ${sevCls(a.severity)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{ALERT_LABEL[a.kind] ?? a.kind} <span className="text-xs font-normal uppercase text-muted-foreground">{a.severity}</span></b>
                <span className="text-xs text-muted-foreground">Seen {a.occurrences}× · first {f(a.first_seen_at)} · last {f(a.last_seen_at)}</span>
              </div>
              <p>{a.message}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {a.notified_at && <span>Emailed {f(a.notified_at)}</span>}{a.escalated_at && <span>Escalated {f(a.escalated_at)}</span>}
                {a.acknowledged_at && <span>Acknowledged {f(a.acknowledged_at)}</span>}
                {a.resolved_at && <span>Resolved {f(a.resolved_at)}{a.auto_resolved ? " (cleared automatically)" : ""}{a.resolution_note ? ` — ${a.resolution_note}` : ""}</span>}
                {!a.resolved_at && <>
                  {!a.acknowledged_at && <Button size="sm" variant="outline" onClick={() => doAct(a.id, "acknowledge")}>Acknowledge</Button>}
                  {d.canManage && <Button size="sm" variant="outline" onClick={() => doAct(a.id, "escalate")}>Escalate</Button>}
                  {d.canManage && <Button size="sm" variant="outline" onClick={() => doAct(a.id, "resolve")}>Resolve</Button>}
                </>}
              </div>
            </div>))}
        </section>

        <section className="space-y-2"><h2 className="font-heading text-lg">Sources</h2>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="p-1">Source</th><th>Health</th><th>Last success</th><th>Next expected</th><th>Stories read</th><th>Bad dates</th><th>Duration</th><th>Last error</th><th /></tr></thead>
            <tbody>{(d.sources as any[]).map((s) => (
              <tr key={s.key} className="border-t border-border align-top">
                <td className="p-1 font-medium">{s.name}{!s.active && <span className="ml-1 text-muted-foreground">(inactive)</span>}</td>
                <td><span className={`rounded-sm px-1.5 py-0.5 ${TONE[s.health as Health]}`}>{HEALTH_LABEL[s.health as Health]}</span>{s.consecutive_failures > 0 && <span className="ml-1">{s.consecutive_failures}× failed</span>}</td>
                <td>{f(s.last_success_at)}</td><td>{f(s.nextExpected)}</td><td>{s.last_item_count ?? "—"}</td><td>{s.last_invalid_dates}</td>
                <td>{s.last_duration_ms != null ? `${(s.last_duration_ms / 1000).toFixed(1)}s` : "—"}</td>
                <td className="max-w-64 text-destructive">{s.last_error ?? ""}</td>
                <td>{d.canManage && s.active && s.health !== "manual" && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => doRetry(s.key)}>{busy === s.key ? "…" : "Retry"}</Button>}</td>
              </tr>))}</tbody></table></div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1"><h2 className="font-heading text-lg">Scheduled runs</h2>
            {(d.runs as any[]).slice(0, 15).map((r) => <div key={r.id} className="text-xs"><b className={r.status === "done" ? "" : "text-destructive"}>{r.status}</b> · {f(r.started_at)} · {r.duration_ms != null ? `${Math.round(r.duration_ms / 1000)}s` : "running"}{r.added != null ? ` · ${r.added} new` : ""}{r.ideasError ? ` · ideas failed: ${r.ideasError}` : ""}{r.error ? ` · ${r.error}` : ""}</div>)}
          </div>
          <div className="space-y-1"><h2 className="font-heading text-lg">Content checks</h2>
            <p className="text-xs">Items in review with no stored citations: <b>{d.missingCitations.length}</b></p>
            {(d.missingCitations as any[]).slice(0, 10).map((i) => <Link key={i.id} to="/marketing/studio/content/$itemId" params={{ itemId: i.id }} className="block text-xs underline">{i.title}</Link>)}
            <p className="text-xs">Headlines duplicated under different links (7 days): <b>{d.duplicateGroups}</b></p>
          </div>
        </section>
      </div>}
    </MkPage>
  );
}
function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div className="rounded-lg border border-border bg-card p-3"><div className="text-[11px] uppercase text-muted-foreground">{label}</div><div className={`text-sm font-medium ${bad ? "text-destructive" : ""}`}>{value}</div></div>;
}
