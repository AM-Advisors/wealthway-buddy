import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { decideSalesQuote, getCroDashboard } from "@/lib/sales-hub.functions";
import { SALES_STAGES } from "@/lib/sales-model";
import { Bars, Donut, Panel, PeriodFilter, Stat, money, pct, stageLabel, usePeriod } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/cro")({
  head: () => ({
    meta: [
      { title: "CRO dashboard - Harmonious" },
      { name: "description", content: "Sales team overview, per-member progress and quote approvals for the CRO." },
      { property: "og:title", content: "CRO dashboard - Harmonious" },
      { property: "og:description", content: "Revenue, targets, pipeline and the quoting engine in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CroDashboard,
});

const progress = (v: number, t: number | null | undefined) => (t ? `${Math.round((v / t) * 100)}%` : "No target");

function CroDashboard() {
  const [period, setPeriod] = usePeriod("quarter");
  const load = useServerFn(getCroDashboard);
  const decide = useServerFn(decideSalesQuote);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["cro-dashboard", period], queryFn: () => load({ data: period }), enabled: period.period !== "custom" || Boolean(period.from && period.to) });
  const d = q.data;

  const act = async (id: string, approve: boolean) => {
    const note = approve ? null : window.prompt("Reason for rejecting?") ?? "";
    if (!approve && !note) return;
    try { await decide({ data: { id, approve, note } }); toast.success(approve ? "Quote approved" : "Quote rejected"); qc.invalidateQueries({ queryKey: ["cro-dashboard"] }); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">CRO dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Team performance, each member's progress, and quotes that need you.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button asChild><Link to="/sales/quotes">New quote</Link></Button>
        </div>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (<>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Revenue closed" value={money(d.revenue.closed)} hint={d.totals.revenueTargetCents ? `${progress(d.revenue.closed, d.totals.revenueTargetCents)} of ${money(d.totals.revenueTargetCents)}` : "No targets set"} />
          <Stat label="Revenue pending" value={money(d.revenue.pending)} />
          <Stat label="Win rate" value={pct(d.revenue.winRate)} />
          <Stat label="Outreach" value={d.total} hint={d.totals.outreachTarget ? `${progress(d.total, d.totals.outreachTarget)} of ${d.totals.outreachTarget}` : undefined} />
          <Stat label="Connect rate" value={pct(d.contactsTouched ? d.connected / d.contactsTouched : null)} hint={`${d.connected} of ${d.contactsTouched} contacts`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Pipeline">
            <Bars data={SALES_STAGES.filter((s) => s !== "contact_later").map((s) => ({ name: stageLabel(s), value: d.stageCounts[s] ?? 0 }))} />
          </Panel>
          <Panel title="Outreach vs connected">
            <Donut center={pct(d.contactsTouched ? d.connected / d.contactsTouched : null)} data={[{ name: "Connected", value: d.connected }, { name: "Not yet", value: Math.max(0, d.contactsTouched - d.connected) }]} />
          </Panel>
        </div>

        <Panel title="Team members">
          {d.perRep.length === 0 ? <p className="text-sm text-muted-foreground">No sales team members yet. Assign Account Executive or BDR roles on the Roles page.</p> : (
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow>
                <TableHead>Member</TableHead><TableHead>Outreach</TableHead><TableHead>Meetings</TableHead><TableHead>Quoted</TableHead><TableHead>Won</TableHead><TableHead>Lost</TableHead>
                <TableHead>Closed</TableHead><TableHead>Pending</TableHead><TableHead>To target</TableHead><TableHead>Last activity</TableHead>
              </TableRow></TableHeader>
              <TableBody>{d.perRep.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link to="/sales/reps/$id" params={{ id: r.id }} className="font-medium text-primary hover:underline">{r.name}</Link></TableCell>
                  <TableCell>{r.outreach}{r.outreachTarget ? ` / ${r.outreachTarget}` : ""}</TableCell>
                  <TableCell>{r.meetings}</TableCell>
                  <TableCell>{(r.stages["quoted"] ?? 0) + (r.stages["contract_sent"] ?? 0)}</TableCell>
                  <TableCell>{r.stages["contract_won"] ?? 0}</TableCell>
                  <TableCell>{r.stages["contract_lost"] ?? 0}</TableCell>
                  <TableCell>{money(r.closed)}</TableCell>
                  <TableCell>{money(r.pending)}</TableCell>
                  <TableCell>{progress(r.closed, r.revenueTargetCents)}</TableCell>
                  <TableCell>{r.lastActivity ? new Date(r.lastActivity).toLocaleDateString() : "-"}</TableCell>
                </TableRow>))}
              </TableBody>
            </Table></div>)}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Waiting for approval (${d.pendingApproval.length})`}>
            {d.pendingApproval.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting.</p> : (
              <ul className="divide-y">{d.pendingApproval.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div><Link to="/sales/quotes/$id" params={{ id: x.id }} className="font-medium text-primary hover:underline">Q-{x.number} {x.title}</Link>
                    <p className="text-xs text-muted-foreground">{x.owner} · {money(x.cents)} {x.needsExec && <Badge variant="outline" className="ml-1">Below rate card</Badge>}</p></div>
                  {d.canApprove && <div className="flex gap-2"><Button size="sm" onClick={() => act(x.id, true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => act(x.id, false)}>Reject</Button></div>}
                </li>))}</ul>)}
          </Panel>
          <Panel title={`Sent, awaiting signature (${d.awaitingSignature.length})`}>
            {d.awaitingSignature.length === 0 ? <p className="text-sm text-muted-foreground">None out for signature.</p> : (
              <ul className="divide-y">{d.awaitingSignature.map((x) => (
                <li key={x.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to="/sales/quotes/$id" params={{ id: x.id }} className="text-primary hover:underline">Q-{x.number} {x.title}</Link>
                  <span className="text-muted-foreground">{x.owner} · {money(x.cents)}</span>
                </li>))}</ul>)}
          </Panel>
          <Panel title="Recently signed">
            {d.signed.length === 0 ? <p className="text-sm text-muted-foreground">No signed quotes yet.</p> : (
              <ul className="divide-y">{d.signed.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link to="/sales/quotes/$id" params={{ id: x.id }} className="text-primary hover:underline">Q-{x.number} {x.title}</Link>
                  {x.onboardedAt ? <Badge>Fund created · Operations notified</Badge> : x.onboardingError ? <Badge variant="destructive">Hand-off failed</Badge> : <Badge variant="outline">Hand-off pending</Badge>}
                </li>))}</ul>)}
          </Panel>
          <Panel title="Needs attention">
            {d.stale.length === 0 && d.expiring.length === 0 ? <p className="text-sm text-muted-foreground">Nothing stalled or expiring.</p> : (
              <ul className="divide-y text-sm">
                {d.expiring.map((x) => <li key={x.id} className="py-2">Quote Q-{x.number} expires {x.validUntil} · {x.owner}</li>)}
                {d.stale.map((s) => <li key={s.id} className="py-2">{s.title} · {stageLabel(s.stage)} · {s.owner} · {s.followUp && s.followUp < new Date().toISOString().slice(0, 10) ? `follow-up overdue (${s.followUp})` : "no activity in 14+ days"}</li>)}
              </ul>)}
          </Panel>
        </div>
      </>)}
    </main>
  );
}
