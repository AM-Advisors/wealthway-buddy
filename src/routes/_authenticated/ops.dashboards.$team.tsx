import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bars, Panel, Stat } from "@/components/sales/sales-ui";
import { AmPage, money } from "@/components/account-management-ui";
import { getTeamDashboard, getFinanceOverview } from "@/lib/staff-directory.functions";
import { Badge } from "@/components/ui/badge";

const TEAMS = ["operations", "finance", "compliance", "marketing", "leadership"] as const;
type Team = (typeof TEAMS)[number];

export const Route = createFileRoute("/_authenticated/ops/dashboards/$team")({
  head: ({ params }) => {
    const t = params.team === "finance" ? "Accounting & Finance" : params.team.charAt(0).toUpperCase() + params.team.slice(1);
    return {
      meta: [
        { title: `${t} dashboard - Harmonious` },
        { name: "description", content: `Workload and status for the Harmonious ${t} team.` },
        { property: "og:title", content: `${t} dashboard - Harmonious` },
        { property: "og:description", content: `${t} team overview.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TeamDashboard,
});

function TeamDashboard() {
  const { team } = Route.useParams();
  const valid = (TEAMS as readonly string[]).includes(team);
  const load = useServerFn(getTeamDashboard);
  const q = useQuery({ queryKey: ["team-dashboard", team], queryFn: () => load({ data: { team: team as Team } }), retry: false, enabled: valid });
  const d = q.data;
  if (!valid) return <AmPage title="Dashboard not found" intro="Choose a team dashboard from the menu."><span /></AmPage>;
  return (
    <AmPage title={d ? `${d.title} dashboard` : "Dashboard"} intro="Read-only overview. Nothing here changes any work.">
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (<>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Team members" value={d.teamStats.members} hint={`${d.teamStats.activeToday} active in the last 24h`} />
          {d.stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} {...("cents" in s && typeof s.cents === "number" ? { hint: money(s.cents) } : {})} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {d.charts.map((c) => (
            <Panel key={c.title} title={c.title}>
              {Object.keys(c.data).length ? <Bars data={Object.entries(c.data).map(([name, value]) => ({ name, value: value as number }))} /> : <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
            </Panel>
          ))}
        </div>
        {team === "finance" && <FinanceOverview />}
      </>)}
    </AmPage>
  );
}

const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString() : "—");

function FinanceOverview() {
  const load = useServerFn(getFinanceOverview);
  const q = useQuery({ queryKey: ["finance-overview"], queryFn: () => load(), retry: false });
  const d = q.data;
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading revenue…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!d) return null;
  const monthLabel = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return (<>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Revenue collected (12 mo)" value={money(d.totals.revenue12m)} />
      <Stat label="Outstanding invoices" value={money(d.totals.outstanding)} />
      <Stat label="Overdue" value={money(d.totals.overdue)} />
      <Stat label="Pending quotes" value={money(d.totals.pendingQuotes)} hint={`${d.quotes.length} open`} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Revenue by month"><Bars money data={d.byMonth.map((m) => ({ name: monthLabel(m.month), value: m.cents }))} /></Panel>
      <Panel title="Revenue by client"><Bars money data={d.byClient.slice(0, 10).map((c) => ({ name: c.client, value: c.paid }))} /></Panel>
    </div>
    <Panel title="Clients">
      <Table head={["Client", "Invoices", "Collected", "Outstanding"]} rows={d.byClient.map((c) => [c.client, c.invoices, money(c.paid), money(c.outstanding)])} empty="No invoices yet." />
    </Panel>
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Recent invoices">
        <Table head={["Invoice", "Client", "Due", "Status", "Amount"]} rows={d.invoices.map((i) => [i.number ?? "Draft", i.client, fmtDate(i.due), <Badge key="s" variant={i.status === "overdue" ? "destructive" : i.status === "paid" ? "default" : "secondary"}>{i.status.replace(/_/g, " ")}</Badge>, money(i.cents)])} empty="No invoices yet." />
      </Panel>
      <Panel title="Payments received">
        <Table head={["Invoice", "Client", "Paid on", "Amount"]} rows={d.payments.map((p) => [p.number ?? "—", p.client, fmtDate(p.paidOn), money(p.cents)])} empty="No payments recorded yet." />
      </Panel>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Pending quotes">
        <Table head={["Quote", "Client", "Status", "Valid until", "Amount"]} rows={d.quotes.map((x) => [x.label, x.client, x.status.replace(/_/g, " "), fmtDate(x.validUntil), money(x.cents)])} empty="No open quotes." />
      </Panel>
      <Panel title="Team activity">
        {d.activity.length ? (
          <ul className="space-y-2 text-sm">
            {d.activity.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 border-b pb-2 last:border-0">
                <span className="text-foreground"><span className="font-medium">{a.who}</span> <span className="text-muted-foreground">{a.kind === "page" ? "viewed" : "did"}</span> {a.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No team activity yet.</p>}
      </Panel>
    </div>
  </>);
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground">{head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="py-1.5 pr-3 text-foreground">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
