import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { getEmployeeActivity } from "@/lib/staff-directory.functions";

export const Route = createFileRoute("/_authenticated/ops/employees_/$userId")({
  head: () => ({
    meta: [
      { title: "Employee activity - Harmonious" },
      { name: "description", content: "Sign-ins, screens viewed and actions taken by a Harmonious employee." },
      { property: "og:title", content: "Employee activity - Harmonious" },
      { property: "og:description", content: "What a team member has been working on." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityPage,
});

const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never");

function ActivityPage() {
  const { userId } = Route.useParams();
  const load = useServerFn(getEmployeeActivity);
  const q = useQuery({ queryKey: ["employee-activity", userId], queryFn: () => load({ data: { userId } }), retry: false });
  const d = q.data;
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <Link to="/ops/people-access" search={{ tab: "employees" }} className="text-sm text-primary hover:underline">← Employees</Link>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (<>
        <header>
          <h1 className="text-3xl">{d.name || d.email}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{d.email} · Last signed in {when(d.lastSignIn)} · Joined {when(d.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-1">{d.roles.map((r) => <Badge key={r} variant="outline">{r.replace(/_/g, " ")}</Badge>)}</div>
        </header>
        <section className="rounded-lg border">
          <h2 className="border-b p-4 text-lg">Activity</h2>
          {!d.events.length ? <p className="p-4 text-sm text-muted-foreground">No activity recorded yet. Activity is recorded from today onward.</p> : (
            <ul className="divide-y">{d.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="flex items-center gap-2"><Badge variant={e.kind === "Viewed" ? "secondary" : "default"}>{e.kind}</Badge><span>{e.what}</span>{e.path && e.what !== e.path && <span className="text-xs text-muted-foreground">{e.path}</span>}</div>
                <span className="text-xs text-muted-foreground">{when(e.when)}</span>
              </li>))}
            </ul>
          )}
        </section>
      </>)}
    </main>
  );
}
