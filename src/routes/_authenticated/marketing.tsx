import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Bars, Panel, Stat } from "@/components/sales/sales-ui";
import { ChannelChip, MkPage, fmt, mkHead } from "@/components/marketing-ui";
import { getMarketingDashboard } from "@/lib/marketing.functions";
import { MarketingEngagementPanel } from "@/components/email-engagement-panel";

export const Route = createFileRoute("/_authenticated/marketing")({
  head: mkHead("Marketing dashboard", "Scheduled posts and emails, approvals and results for the Harmonious marketing team."),
  component: MarketingDashboard,
});

function MarketingDashboard() {
  const load = useServerFn(getMarketingDashboard);
  const q = useQuery({ queryKey: ["mk-dashboard"], queryFn: () => load(), retry: false });
  const d = q.data;
  return (
    <MkPage title="Marketing" intro="Plan, design and schedule social posts and emails. Everything needs a second person's approval before it goes out."
      actions={<div className="flex gap-2"><Button asChild variant="outline"><Link to="/marketing/emails/$id" params={{ id: "new" }}>New email</Link></Button><Button asChild><Link to="/marketing/posts/$id" params={{ id: "new" }}>New post</Link></Button></div>}>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (<>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat label="Scheduled (7 days)" value={d.stats.scheduledThisWeek} />
          <Stat label="Waiting for approval" value={d.stats.waiting} />
          <Stat label="Posts published (30d)" value={d.stats.published30} />
          <Stat label="Emails sent (30d)" value={d.stats.emailsSent30} />
          <Stat label="Unsubscribes (30d)" value={d.stats.unsubscribes30} />
          <Stat label="Failed" value={d.stats.failed} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Coming up this week" action={<Link to="/marketing/calendar" className="text-sm text-primary underline">Calendar</Link>}>
            {d.upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled in the next 7 days.</p> : (
              <ul className="divide-y">{d.upcoming.map((u) => (
                <li key={u.kind + u.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link to={u.kind === "post" ? "/marketing/posts/$id" : "/marketing/emails/$id"} params={{ id: u.id }} className="truncate hover:underline">{u.title}</Link>
                  <span className="flex shrink-0 items-center gap-1">{(u.channels as string[]).map((c) => <ChannelChip key={c} c={c} />)}<span className="ml-2 text-muted-foreground">{fmt(u.at)}</span></span>
                </li>))}</ul>
            )}
          </Panel>
          <Panel title="Waiting for approval">
            {d.waiting.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting.</p> : (
              <ul className="divide-y">{d.waiting.map((w) => (
                <li key={w.kind + w.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link to={w.kind === "post" ? "/marketing/posts/$id" : "/marketing/emails/$id"} params={{ id: w.id }} className="truncate hover:underline">{w.title}</Link>
                  <span className="text-xs text-muted-foreground">{w.kind === "post" ? "Post" : "Email"}{w.mine ? " · yours" : d.canApprove ? " · you can approve" : ""}</span>
                </li>))}</ul>
            )}
          </Panel>
        </div>
        <Panel title="Posts published by channel (30 days)"><Bars data={d.byChannel} /></Panel>
        <Panel title="ClickUp content flow" action={<Link to="/marketing/calendar" className="text-sm text-primary underline">Open calendar</Link>}>
          <p className="mb-3 text-sm text-muted-foreground">Each ClickUp task moves through Write → Approve → Send → Live. Opens and clicks are tracked on sent emails.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="1. Write" value={d.clickupFlow.counts.write ?? 0} />
            <Stat label="2. Waiting for approval" value={d.clickupFlow.counts.approve ?? 0} />
            <Stat label="3. Approved, sending" value={d.clickupFlow.counts.send ?? 0} />
            <Stat label="4. Live" value={d.clickupFlow.counts.live ?? 0} />
            <Stat label="Failed" value={d.clickupFlow.counts.failed ?? 0} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-medium">Sent ClickUp emails</h4>
              {d.clickupFlow.emails.length === 0 ? <p className="text-sm text-muted-foreground">None sent yet.</p> : (
                <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Email</th><th className="text-right">Delivered</th><th className="text-right">Readers</th><th className="text-right">Opens</th><th className="text-right">Clicks</th></tr></thead>
                  <tbody>{d.clickupFlow.emails.map((e) => (
                    <tr key={e.id} className="border-t"><td className="truncate py-1"><Link to="/marketing/emails/$id" params={{ id: e.id }} className="hover:underline">{e.title}</Link></td><td className="text-right">{e.delivered}</td><td className="text-right">{e.readers}</td><td className="text-right">{e.opens}</td><td className="text-right">{e.clicks}</td></tr>))}</tbody></table>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">Published ClickUp posts</h4>
              {d.clickupFlow.posts.length === 0 ? <p className="text-sm text-muted-foreground">None published yet.</p> : (
                <ul className="divide-y">{d.clickupFlow.posts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1 text-sm"><Link to="/marketing/posts/$id" params={{ id: p.id }} className="truncate hover:underline">{p.title}</Link><span className="flex shrink-0 items-center gap-1">{p.channels.map((c) => <ChannelChip key={c} c={c} />)}<span className="ml-1 text-muted-foreground">{fmt(p.at)}</span></span></li>))}</ul>
              )}
            </div>
          </div>
        </Panel>
        <MarketingEngagementPanel />
      </>)}
    </MkPage>
  );
}
