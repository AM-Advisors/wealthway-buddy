import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "@tanstack/react-router";
import { SALES_STAGES } from "@/lib/sales-model";
import { Bars, Donut, Panel, PeriodFilter, Stat, channelLabel, money, pct, stageLabel, type PeriodValue } from "@/components/sales/sales-ui";
import { OutreachFeed } from "@/components/sales/outreach-feed";

export function RepOverview({ data: d, error, period, setPeriod }: { data: any; error: Error | null; period: PeriodValue; setPeriod: (p: PeriodValue) => void }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl">{d?.name ?? "Rep overview"}</h1>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {!d ? (!error && <p className="text-sm text-muted-foreground">Loading…</p>) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Stat label="Outreach" value={d.outreach} />
            <Stat label="Connect rate" value={pct(d.contactsTouched ? d.connected / d.contactsTouched : null)} hint={`${d.connected} of ${d.contactsTouched}`} />
            <Stat label="Meetings held" value={d.meetingsHeld} />
            <Stat label="Revenue closed" value={money(d.closed)} />
            <Stat label="Revenue pending" value={money(d.pending)} hint={`Forecast ${money(d.forecast)}`} />
            <Stat label="Win rate" value={pct(d.winRate)} />
          </div>
          {d.target && (
            <Panel title={`Target ${d.target.start} to ${d.target.end}`}>
              <div className="space-y-3 text-sm">
                <div><div className="mb-1 flex justify-between"><span>Revenue</span><span>{money(d.closed)} / {money(d.target.revenueCents)}</span></div><Progress value={d.target.revenueCents ? Math.min(100, (d.closed / d.target.revenueCents) * 100) : 0} /></div>
                <div><div className="mb-1 flex justify-between"><span>Outreach</span><span>{d.outreach} / {d.target.outreach}</span></div><Progress value={d.target.outreach ? Math.min(100, (d.outreach / d.target.outreach) * 100) : 0} /></div>
              </div>
            </Panel>
          )}
          <Panel title="Today">
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div><div className="font-medium text-foreground">Follow-ups due ({d.today.followUps.length})</div>{d.today.followUps.map((f: any) => <div key={f.id} className="text-muted-foreground">{f.title} · {f.date}</div>)}</div>
              <div><div className="font-medium text-foreground">Replies waiting</div><div className="text-muted-foreground">{d.today.repliesWaiting}</div></div>
              <div><div className="font-medium text-foreground">Quotes awaiting signature ({d.today.quotesAwaitingSignature.length})</div>{d.today.quotesAwaitingSignature.map((q: any) => <Link key={q.id} to="/sales/quotes/$id" params={{ id: q.id }} className="block text-muted-foreground hover:underline">{q.title}</Link>)}</div>
            </div>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Status"><Bars data={SALES_STAGES.map((s) => ({ name: stageLabel(s), value: d.stageCounts[s] ?? 0 }))} /></Panel>
            <Panel title="By channel"><Donut data={d.byChannel.map((c: any) => ({ name: channelLabel(c.key), value: c.count }))} /></Panel>
            <Panel title="Average days in each stage">
              {Object.keys(d.avgDays).length ? <ul className="text-sm">{Object.entries(d.avgDays).map(([k, v]) => <li key={k} className="flex justify-between py-1"><span>{stageLabel(k)}</span><span className="text-muted-foreground">{String(v)} days</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Not enough stage history yet.</p>}
            </Panel>
          </div>
          <Panel title="Clients and their Harmonious team">
            {d.clients.length ? (
              <ul className="divide-y text-sm">{d.clients.map((c: any) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="ml-auto flex flex-wrap gap-1">
                    {c.operations.map((n: string) => <Badge key={`o${n}`} variant="secondary">Operations: {n}</Badge>)}
                    {c.accountManagers.map((n: string) => <Badge key={`a${n}`} variant="outline">Account Manager: {n}</Badge>)}
                    {!c.operations.length && !c.accountManagers.length && <span className="text-xs text-muted-foreground">No team assigned yet</span>}
                  </span>
                </li>
              ))}</ul>
            ) : <p className="text-sm text-muted-foreground">No clients linked yet. Link a client to a contact or deal to see its team.</p>}
          </Panel>
          <Panel title="Deals">
            <ul className="divide-y text-sm">{d.deals.map((x: any) => (
              <li key={x.id} className="flex justify-between gap-2 py-2"><span className="text-foreground">{x.title}</span><span className="text-muted-foreground">{stageLabel(x.stage)} · {money(x.amountCents)}{x.lostReason ? ` · ${x.lostReason}` : ""}</span></li>
            ))}{!d.deals.length && <li className="py-2 text-muted-foreground">No deals yet.</li>}</ul>
          </Panel>
          <Panel title="Messages"><OutreachFeed period={period} filter={{ ownerId: d.id }} /></Panel>
        </>
      )}
    </div>
  );
}
