import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSalesDashboard } from "@/lib/sales-hub.functions";
import { SALES_STAGES, CONNECT_CHANNELS, QUOTE_STATUS_LABEL } from "@/lib/sales-model";
import { Bars, Donut, Panel, PeriodFilter, Stat, channelLabel, money, pct, stageLabel, usePeriod } from "@/components/sales/sales-ui";
import { OutreachFeed, type OutreachFilter } from "@/components/sales/outreach-feed";

export const Route = createFileRoute("/_authenticated/sales_/dashboard")({
  head: () => ({
    meta: [
      { title: "Sales dashboard - Harmonious" },
      { name: "description", content: "Team outreach, connections, pipeline stages and revenue for Harmonious Sales." },
      { property: "og:title", content: "Sales dashboard - Harmonious" },
      { property: "og:description", content: "Outreach by team, rep, channel and service with drill-down to every message." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SalesDashboard,
});

function SalesDashboard() {
  const [period, setPeriod] = usePeriod("month");
  const [drill, setDrill] = useState<{ label: string; filter: OutreachFilter } | null>(null);
  const load = useServerFn(getSalesDashboard);
  const q = useQuery({ queryKey: ["sales-dashboard", period], queryFn: () => load({ data: period }), enabled: period.period !== "custom" || Boolean(period.from && period.to) });
  const d = q.data;
  const open = (label: string, filter: OutreachFilter) => setDrill({ label, filter });

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Sales dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Click any number, slice or bar to see the messages behind it.</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!d ? <p className="text-sm text-muted-foreground">{q.isFetching ? "Loading…" : "Pick a date range."}</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Total outreach" value={d.total} onClick={() => open("All outreach", {})} />
            <Stat label="Contacts reached" value={d.contactsTouched} />
            <Stat label="Connected" value={d.connected} hint={`Connect rate ${pct(d.contactsTouched ? d.connected / d.contactsTouched : null)}`} />
            <Stat label="Revenue closed" value={money(d.revenue.closed)} hint={`Win rate ${pct(d.revenue.winRate)}`} />
            <Stat label="Revenue pending" value={money(d.revenue.pending)} hint={`Weighted forecast ${money(d.revenue.forecast)}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Outreach vs connected">
              <Donut center={pct(d.contactsTouched ? d.connected / d.contactsTouched : null)}
                data={[{ name: "Connected", value: d.connected }, { name: "Not yet connected", value: Math.max(0, d.contactsTouched - d.connected) }]} />
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {CONNECT_CHANNELS.map((c) => <span key={c}>{channelLabel(c)}: {d.viaCounts[c] ?? 0}</span>)}
              </div>
            </Panel>
            <Panel title="By channel">
              <Donut data={d.byChannel.map((x: any) => ({ name: channelLabel(x.key), key: x.key, value: x.count }))} onSelect={(k) => open(`${channelLabel(k)} outreach`, { channel: k })} />
            </Panel>
            <Panel title="By service">
              <Donut data={d.byService.map((x: any) => ({ name: x.label, key: x.key, value: x.count }))} onSelect={(k) => open(`Outreach for ${d.byService.find((s: any) => s.key === k)?.label ?? k}`, { serviceKey: k })} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Pipeline status">
              <Bars data={SALES_STAGES.map((s) => ({ name: stageLabel(s), key: s, value: d.stageCounts[s] ?? 0 }))} />
            </Panel>
            <Panel title="Outreach per team member">
              <Bars data={d.byOwner.map((x: any) => ({ name: x.label, key: x.key, value: x.count }))} onSelect={(k) => open(`Outreach by ${d.byOwner.find((o: any) => o.key === k)?.label ?? "rep"}`, { ownerId: k })} />
            </Panel>
          </div>

          <Panel title="Quote status" action={<Button asChild size="sm" variant="outline"><Link to="/sales/quotes">All quotes</Link></Button>}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {(d.quoteStatus ?? []).map((x: any) => (
                <div key={x.status} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{QUOTE_STATUS_LABEL[x.status] ?? x.status}</div>
                  <div className="text-xl font-semibold text-foreground">{x.count}</div>
                  <div className="text-xs text-muted-foreground">{money(x.cents)}</div>
                </div>
              ))}
            </div>
            {(d.recentQuotes ?? []).length > 0 && (
              <ul className="mt-3 divide-y text-sm">
                {d.recentQuotes.map((q: any) => (
                  <li key={q.id} className="flex justify-between gap-2 py-2">
                    <Link to="/sales/quotes/$id" params={{ id: q.id }} className="text-foreground hover:underline">Q-{q.number} · {q.title}</Link>
                    <span className="text-muted-foreground">{QUOTE_STATUS_LABEL[q.status] ?? q.status} · {money(q.cents)} · {q.owner}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {drill && (
            <Panel title={drill.label} action={<Button size="sm" variant="ghost" onClick={() => setDrill(null)}>Close</Button>}>
              <OutreachFeed period={period} filter={drill.filter} />
            </Panel>
          )}

          <Panel title="Team leaderboard" action={<Button asChild size="sm" variant="outline"><Link to="/sales/team">Manage team</Link></Button>}>
            <Table>
              <TableHeader><TableRow><TableHead>Rep</TableHead><TableHead className="text-right">Outreach</TableHead><TableHead className="text-right">Meetings</TableHead><TableHead className="text-right">Closed</TableHead><TableHead className="text-right">Pending</TableHead><TableHead className="text-right">Win rate</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...d.perRep].sort((a: any, b: any) => b.closed - a.closed || b.outreach - a.outreach).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell><Link to="/sales/reps/$id" params={{ id: r.id }} className="font-medium text-foreground underline-offset-4 hover:underline">{r.name}</Link></TableCell>
                    <TableCell className="text-right"><button className="underline-offset-4 hover:underline" onClick={() => open(`Outreach by ${r.name}`, { ownerId: r.id })}>{r.outreach}</button></TableCell>
                    <TableCell className="text-right">{r.meetings}</TableCell>
                    <TableCell className="text-right">{money(r.closed)}</TableCell>
                    <TableCell className="text-right">{money(r.pending)}</TableCell>
                    <TableCell className="text-right">{pct(r.winRate)}</TableCell>
                  </TableRow>
                ))}
                {!d.perRep.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No sales team members yet. Assign Sales roles on the Roles page.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Stale deals (no touch in 14 days or follow-up overdue)">
              {d.stale.length ? <ul className="divide-y text-sm">{d.stale.map((s: any) => (
                <li key={s.id} className="flex justify-between gap-2 py-2"><span className="text-foreground">{s.title} <span className="text-muted-foreground">· {s.owner} · {stageLabel(s.stage)}</span></span><span className="text-xs text-muted-foreground">{s.followUp ? `Follow up ${s.followUp}` : `Last ${new Date(s.last).toLocaleDateString()}`}</span></li>
              ))}</ul> : <p className="text-sm text-muted-foreground">Nothing stale.</p>}
            </Panel>
            <Panel title="Why contracts were lost">
              <Bars data={d.lossReasons.map((l: any) => ({ name: l.reason, value: l.count }))} />
            </Panel>
          </div>
        </>
      )}
    </main>
  );
}
