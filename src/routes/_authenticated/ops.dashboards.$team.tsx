import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bars, Panel, Stat } from "@/components/sales/sales-ui";
import { AmPage, money } from "@/components/account-management-ui";
import { getTeamDashboard } from "@/lib/staff-directory.functions";

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
      </>)}
    </AmPage>
  );
}
