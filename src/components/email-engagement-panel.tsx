import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Panel, Stat } from "@/components/sales/sales-ui";
import { getMarketingEngagement } from "@/lib/email-flows.functions";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

/** Marketing dashboard: opens, clicks, replies, likely forwards (30 days). */
export function MarketingEngagementPanel() {
  const load = useServerFn(getMarketingEngagement);
  const q = useQuery({ queryKey: ["mk-engagement"], queryFn: () => load(), retry: false });
  const d = q.data;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Loading engagement…</p>;
  const t = d.totals;
  const max = Math.max(1, ...d.byDay.map((x) => x.opens + x.clicks));
  return (
    <div className="space-y-4">
      <h2 className="text-xl">Email engagement (30 days)</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Delivered" value={t.delivered} hint={`${d.flows.sent} from follow-up flows`} />
        <Stat label="Opened" value={t.uniqueOpens} hint={`${pct(t.uniqueOpens, t.delivered)} open rate · ${t.opens} total`} />
        <Stat label="Clicked" value={t.uniqueClicks} hint={`${pct(t.uniqueClicks, t.delivered)} click rate · ${t.clicks} total`} />
        <Stat label="Replies" value={t.replies} hint="Logged in Sales" />
        <Stat label="Likely forwarded" value={t.likelyForwards} hint="Estimate: opened on a second device or location" />
        <Stat label="Unsubscribes" value={t.unsubscribes} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Opens and clicks by day">
          {d.byDay.length === 0 ? <p className="text-sm text-muted-foreground">No opens or clicks yet. Tracking starts with emails sent from now on.</p> : (
            <div className="flex h-40 items-end gap-1">{d.byDay.map((x) => (
              <div key={x.day} className="flex flex-1 flex-col justify-end" title={`${x.day}: ${x.opens} opens, ${x.clicks} clicks`}>
                <div className="bg-accent" style={{ height: `${(x.clicks / max) * 100}%` }} />
                <div className="bg-primary" style={{ height: `${(x.opens / max) * 100}%` }} />
              </div>))}</div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Dark = opens, light = clicks.</p>
        </Panel>
        <Panel title="Most-clicked links">
          {d.topLinks.length === 0 ? <p className="text-sm text-muted-foreground">No clicks yet.</p> : (
            <ul className="divide-y text-sm">{d.topLinks.map((l) => <li key={l.url} className="flex justify-between gap-2 py-2"><span className="truncate">{l.url}</span><span className="shrink-0 font-medium">{l.clicks}</span></li>)}</ul>
          )}
        </Panel>
      </div>
      <Panel title="By email">
        {d.perEmail.length === 0 ? <p className="text-sm text-muted-foreground">No marketing emails sent in the last 30 days.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Email</th><th>Sent</th><th>Opened</th><th>Clicked</th><th>Likely forwarded</th></tr></thead>
            <tbody className="divide-y">{d.perEmail.map((m) => (
              <tr key={m.id}><td className="py-2">{m.name}</td><td>{m.sent}</td><td>{m.uniqueOpens} ({pct(m.uniqueOpens, m.sent)})</td><td>{m.uniqueClicks} ({pct(m.uniqueClicks, m.sent)})</td><td>{m.forwards}</td></tr>))}</tbody>
          </table></div>
        )}
      </Panel>
      <Panel title="Proposals, RFPs & RFQs sent by Sales">
        {(d.proposals ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No proposals emailed in the last 30 days.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Document</th><th>Rep</th><th>Sent</th><th>Read?</th><th>Opens</th><th>Clicks</th><th>Likely forwarded</th><th>Last activity</th></tr></thead>
            <tbody className="divide-y">{d.proposals.map((p) => (
              <tr key={p.id}><td className="py-2"><Link to="/sales/documents/$id" params={{ id: p.id }} className="text-primary hover:underline">{p.title}</Link></td><td>{p.owner}</td><td>{new Date(p.sentAt).toLocaleDateString()}</td>
                <td>{p.opened || p.clicks > 0 ? "Yes" : "Not yet"}</td><td>{p.opens}</td><td>{p.clicks}</td><td>{p.forwards}</td><td>{p.lastActivityAt ? new Date(p.lastActivityAt).toLocaleString() : "-"}</td></tr>))}</tbody>
          </table></div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Opens can be missed when an email app blocks images; a click on "View" always counts as read. Forwards are an estimate.</p>
      </Panel>
    </div>
  );
}
