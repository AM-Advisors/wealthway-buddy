import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { getAdminAccess } from "@/lib/admin.functions";
import { getFundingDashboard } from "@/lib/funding-dashboard.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/funding")({
  head: () => ({
    meta: [
      { title: "Funding Dashboard — Harmonious Admin" },
      {
        name: "description",
        content:
          "Live funding snapshot for every Harmonious fund: capital raised, commitments in progress and progress toward the target raise.",
      },
      { property: "og:title", content: "Funding Dashboard — Harmonious Admin" },
      {
        property: "og:description",
        content: "Per-fund raised, in-progress applications and target-raise progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundingDashboard,
});

function money(cents?: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function pct(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

function ProgressBar({ percent }: { percent: number | null }) {
  const width = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function FundingDashboard() {
  const access = useServerFn(getAdminAccess);
  const load = useServerFn(getFundingDashboard);

  const accessQuery = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const isAdmin = accessQuery.data?.isAdmin;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-funding-dashboard"],
    queryFn: () => load(),
    enabled: isAdmin === true,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  if (accessQuery.isLoading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The funding dashboard is limited to Harmonious staff.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to your application</Link>
        </Button>
      </main>
    );
  }

  const funds = data?.funds ?? [];
  const totals = data?.totals;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Funding dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Capital raised across every fund, applications still in progress, and how each fund is tracking
            toward its target raise.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin">Back to queue</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/funds">Fund setup</Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total raised"
          value={money(totals?.receivedCents)}
          sub={`${totals?.settled ?? 0} settled investor${totals?.settled === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Committed"
          value={money(totals?.committedCents)}
          sub={`${money(totals?.inFlightCents)} in transit`}
        />
        <StatCard
          label="In progress"
          value={String(totals?.inProgress ?? 0)}
          sub={`across ${totals?.funds ?? 0} fund${totals?.funds === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Target raise"
          value={money(totals?.targetCents)}
          sub={
            totals && totals.targetCents > 0
              ? `${Math.min(
                  100,
                  Math.round(((totals.receivedCents / totals.targetCents) * 100)),
                )}% raised overall`
              : "No targets set"
          }
        />
      </div>

      <div className="mt-8 space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading funds…</p>}
        {!isLoading && funds.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No funds yet. Set up a fund to start tracking funding.
            </CardContent>
          </Card>
        )}

        {funds.map((f) => (
          <Card key={f.id}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {f.name}
                    <span className="text-muted-foreground"> · /{f.slug}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>Reg D {f.regType === "506b" ? "506(b)" : "506(c)"}</Badge>
                    <Badge variant={f.isOpen ? "secondary" : "outline"}>
                      {f.isOpen ? "Open" : "Closed"}
                    </Badge>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/fund/$fundId" params={{ fundId: f.id }}>
                    Open fund
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Raised</p>
                  <p className="text-lg font-semibold">{money(f.receivedCents)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Committed</p>
                  <p className="text-lg font-semibold">{money(f.committedCents)}</p>
                  <p className="text-xs text-muted-foreground">{money(f.inFlightCents)} in transit</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Applications</p>
                  <p className="text-lg font-semibold">{f.applications}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.inProgress} in progress · {f.settled} settled
                    {f.declined ? ` · ${f.declined} declined` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Target raise</p>
                  <p className="text-lg font-semibold">{money(f.targetCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.remainingToTargetCents !== null
                      ? `${money(f.remainingToTargetCents)} to go`
                      : "No target set"}
                  </p>
                </div>
              </div>

              {f.targetCents !== null && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress toward target</span>
                    <span className="font-medium text-foreground">{pct(f.percentOfTarget)}</span>
                  </div>
                  <ProgressBar percent={f.percentOfTarget} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
