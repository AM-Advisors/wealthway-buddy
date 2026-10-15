import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPersonActivity } from "@/lib/user-access.functions";
import { UserInsights } from "@/components/user-insights";

export const Route = createFileRoute("/_authenticated/ops/people/$userId")({
  head: () => ({
    meta: [
      { title: "User activity - Harmonious" },
      { name: "description", content: "Every sign-in, page viewed, click and access change for one user." },
      { property: "og:title", content: "User activity - Harmonious" },
      { property: "og:description", content: "The full activity trail for one Harmonious user." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PersonActivityPage,
});

const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never");
const KINDS = ["All", "Viewed", "Clicked", "Action", "Access change"];

function PersonActivityPage() {
  const { userId } = Route.useParams();
  const load = useServerFn(getPersonActivity);
  const [cursor, setCursor] = useState<string | undefined>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useQuery({ queryKey: ["person-activity", userId, cursor, from, to], queryFn: () => load({ data: { userId, ...(cursor ? { before: cursor } : {}), ...(from ? { from: new Date(from + "T00:00:00").toISOString() } : {}), ...(to ? { to: new Date(to + "T23:59:59.999").toISOString() } : {}) } }), retry: false });
  const [kind, setKind] = useState("All");
  const [search, setSearch] = useState("");
  const d = q.data;
  const events = useMemo(() => (d?.events ?? []).filter((e) => (kind === "All" || e.kind === kind) && `${e.what} ${e.path ?? ""}`.toLowerCase().includes(search.toLowerCase())), [d, kind, search]);
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <Link to="/ops/people-access" search={{ tab: "others" }} className="text-sm text-primary hover:underline">← People & Access</Link>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (<>
        <header>
          <h1 className="text-3xl">{d.name || d.email}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{d.email} · Account created {when(d.createdAt)} · Email confirmed {when(d.confirmedAt)} · Last signed in {when(d.lastSignIn)}</p>
          {!!d.roles.length && <div className="mt-2 flex flex-wrap gap-1">{d.roles.map((r) => <Badge key={r} variant="outline">{r.replace(/_/g, " ")}</Badge>)}</div>}
        </header>
        {d.email && <UserInsights email={d.email} />}
        <section className="rounded-lg border">
          <div className="flex flex-wrap items-center gap-2 border-b p-4">
            <h2 className="mr-auto text-lg">Activity ({events.length})</h2>
            {KINDS.map((k) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k}</Button>)}
            <Input className="max-w-xs" placeholder="Search activity" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Input aria-label="Activity from date" type="date" className="w-auto" value={from} onChange={e => { setFrom(e.target.value); setCursor(undefined); }} />
            <Input aria-label="Activity to date" type="date" className="w-auto" value={to} onChange={e => { setTo(e.target.value); setCursor(undefined); }} />
          </div>
          {!events.length ? <p className="p-4 text-sm text-muted-foreground">No activity recorded yet. Pages and clicks are recorded from today onward.</p> : (
            <ul className="divide-y">{events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-center gap-2"><Badge variant={e.kind === "Viewed" ? "secondary" : "outline"}>{e.kind}</Badge><span className="truncate">{e.what}</span>{e.path && e.what !== e.path && <span className="text-xs text-muted-foreground">{e.path}</span>}</div>
                <span className="text-xs text-muted-foreground">{when(e.when)}</span>
              </li>))}
            </ul>
          )}
        </section>
        <div className="flex gap-2"><Button variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)}>Newest activity</Button><Button variant="outline" disabled={!d.nextCursor} onClick={() => setCursor(d.nextCursor ?? undefined)}>Older activity</Button></div>
      </>)}
    </main>
  );
}
