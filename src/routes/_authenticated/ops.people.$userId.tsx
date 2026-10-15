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
        <AccountOverview d={d} />
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

const money = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const label = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "—");

/** Account + person record + missing info + everything linked, in one place. Display only. */
function AccountOverview({ d }: { d: any }) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border p-4">
        <h2 className="text-lg">Missing information</h2>
        {d.missing.length ? <div className="mt-2 flex flex-wrap gap-1">{d.missing.map((g: string) => <Badge key={g} variant="destructive">{g}</Badge>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Nothing missing.</p>}
        {d.missing.includes("Person record not linked") && <p className="mt-2 text-xs text-muted-foreground">This sign-in isn't connected to a person record yet, so name, phone, address and KYC/AML can't be checked.{d.people.some((p: any) => !p.linked) ? " A person record with the same email exists below." : ""}</p>}
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="text-lg">Person record</h2>
        {!d.people.length ? <p className="mt-2 text-sm text-muted-foreground">No person record found for this email.</p> : d.people.map((p: any) => (
          <dl key={p.id} className="mt-2 grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Name</dt><dd>{p.name || "—"} {!p.linked && <Badge variant="outline" className="ml-1">Same email, not linked</Badge>}</dd>
            <dt className="text-muted-foreground">Email</dt><dd>{p.email || "—"}</dd>
            <dt className="text-muted-foreground">Phone</dt><dd>{p.phone || "—"}</dd>
            <dt className="text-muted-foreground">Address</dt><dd>{p.address || "—"}</dd>
            <dt className="text-muted-foreground">KYC / AML</dt><dd className="capitalize">{label(p.kyc)} / {label(p.aml)}</dd>
            <dt className="text-muted-foreground">Onboarding</dt><dd className="capitalize">{label(p.state)}</dd>
          </dl>))}
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="text-lg">Clients ({d.clients.length})</h2>
        <ul className="mt-2 space-y-1 text-sm">{d.clients.length ? d.clients.map((c: any) => <li key={c.id} className="flex justify-between gap-2"><Link to="/ops/clients/$clientId" params={{ clientId: c.id }} className="text-primary hover:underline">{c.name}</Link><span className="capitalize text-muted-foreground">{label(c.role)}</span></li>) : <li className="text-muted-foreground">None</li>}</ul>
        <h2 className="mt-4 text-lg">Fund teams ({d.funds.length})</h2>
        <ul className="mt-2 space-y-1 text-sm">{d.funds.length ? d.funds.map((f: any) => <li key={f.id} className="flex justify-between gap-2"><Link to="/ops/funds/$fundId" params={{ fundId: f.id }} className="text-primary hover:underline">{f.name}</Link><span className="capitalize text-muted-foreground">{label(f.role)}</span></li>) : <li className="text-muted-foreground">None</li>}</ul>
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="text-lg">Investments ({d.investments.length})</h2>
        <ul className="mt-2 space-y-1 text-sm">{d.investments.length ? d.investments.map((i: any) => <li key={i.id} className="flex flex-wrap justify-between gap-2"><Link to="/ops/funds/$fundId" params={{ fundId: i.offeringId }} className="text-primary hover:underline">{i.fund}</Link><span className="text-muted-foreground">{money(i.committed)} committed · {money(i.funded)} funded · <span className="capitalize">{label(i.status)}</span></span></li>) : <li className="text-muted-foreground">None</li>}</ul>
      </div>
    </section>
  );
}
