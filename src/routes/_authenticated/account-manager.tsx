import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Bars, Donut, Panel, Stat } from "@/components/sales/sales-ui";
import { AmPage, HandoffList, RenewalList, healthVariant, money, useAmDashboard } from "@/components/account-management-ui";

export const Route = createFileRoute("/_authenticated/account-manager")({
  head: () => ({
    meta: [
      { title: "Account management dashboard - Harmonious" },
      { name: "description", content: "Client health, new hand-offs, renewals and what's waiting for Account Managers." },
      { property: "og:title", content: "Account management dashboard - Harmonious" },
      { property: "og:description", content: "Keep signed clients healthy and growing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AmDashboard,
});

function AmDashboard() {
  const q = useAmDashboard();
  const d = q.data;
  return (
    <AmPage title="Account management" intro={d?.team ? "Every client across Account Managers." : "Your assigned clients. Health is a guide only and never blocks any work."}>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (<>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Clients" value={d.totals.clients} />
          <Stat label="Active funds" value={d.totals.activeFunds} />
          <Stat label="Funds in setup" value={d.totals.inSetup} />
          <Stat label="Unpaid invoices" value={d.totals.unpaidInvoices} hint={money(d.totals.unpaidCents)} />
          <Stat label="Open service requests" value={d.totals.openRequests} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Client health">
            <Donut data={Object.entries(d.healthCounts).map(([name, value]) => ({ name, value }))} center={String(d.totals.clients)} />
          </Panel>
          <Panel title="Funds by setup stage">
            <Bars data={Object.entries(d.stageCounts).map(([name, value]) => ({ name, value }))} />
          </Panel>
        </div>
        <Panel title="Clients needing attention" action={<Link to="/account-manager/clients" className="text-sm text-primary hover:underline">All clients</Link>}>
          {d.book.filter((b) => b.health !== "Healthy").length === 0 ? <p className="text-sm text-muted-foreground">All clients look healthy.</p> : (
            <ul className="divide-y">{d.book.filter((b) => b.health !== "Healthy").slice(0, 12).map((c) => (
              <li key={c.clientId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <Link to="/ops/clients/$clientId" params={{ clientId: c.clientId }} search={{} as never} className="font-medium hover:underline">{c.name}</Link>
                  <p className="text-xs text-muted-foreground">{c.reasons.join(" · ")}</p>
                </div>
                <Badge variant={healthVariant(c.health)}>{c.health}</Badge>
              </li>))}</ul>)}
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="New client hand-offs" action={<Link to="/account-manager/handoffs" className="text-sm text-primary hover:underline">View all</Link>}>
            <HandoffList rows={d.handoffs.slice(0, 5)} />
          </Panel>
          <Panel title="Renewals coming up" action={<Link to="/account-manager/renewals" className="text-sm text-primary hover:underline">View all</Link>}>
            <RenewalList rows={d.renewals.slice(0, 5)} />
          </Panel>
        </div>
        <Panel title="Waiting on you">
          {d.waiting.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting.</p> : (
            <ul className="divide-y text-sm">{d.waiting.slice(0, 15).map((w) => (
              <li key={w.kind + w.id} className="flex justify-between gap-2 py-2"><span><Badge variant="outline" className="mr-2">{w.kind}</Badge>{w.client} · {w.title}</span><span className="text-xs text-muted-foreground">{new Date(w.at).toLocaleDateString()}</span></li>))}
            </ul>)}
        </Panel>
      </>)}
    </AmPage>
  );
}
