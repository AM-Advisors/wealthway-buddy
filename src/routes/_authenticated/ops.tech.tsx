import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AREAS, PRIORITIES, ROADMAP_COLUMNS, ROADMAP_LABEL, FEEDBACK_STATUS_LABEL, type FeedbackStatus, type RoadmapColumn } from "@/lib/tech-model";
import { STAGE_LABEL, type IssueStage } from "@/lib/software-issue-model";
import { addToBacklog, getFeedbackScreenshot, getTechWorkspace, publishReleaseNote, saveBacklogItem, saveReleaseNote, triageFeedback } from "@/lib/tech.functions";

const TABS = ["inbox", "backlog", "roadmap", "bugs", "errors", "whats-new"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { inbox: "Inbox", backlog: "Backlog", roadmap: "Roadmap", bugs: "Bugs", errors: "Caught errors", "whats-new": "What's new" };
const AUDIENCE: Record<string, string> = { client: "Client", investor: "Investor", staff: "Harmonious" };
const PRIORITY_VARIANT: Record<string, "destructive" | "default" | "secondary" | "outline"> = { urgent: "destructive", high: "default", normal: "secondary", low: "outline" };

export const Route = createFileRoute("/_authenticated/ops/tech")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: (TABS as readonly string[]).includes(String(s["tab"])) ? (s["tab"] as Tab) : undefined }),
  head: () => ({ meta: [
    { title: "Tech | Harmonious Operations" },
    { name: "description", content: "Bug reports, ideas, roadmap, caught errors and what's new on the Harmonious platform." },
    { property: "og:title", content: "Tech | Harmonious Operations" },
    { property: "og:description", content: "Bug reports, ideas, roadmap, caught errors and what's new on the Harmonious platform." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: TechPage,
});

function useAct<T>(fn: (v: T) => Promise<unknown>, ok: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { toast.success(ok); qc.invalidateQueries({ queryKey: ["tech-workspace"] }); }, onError: (e: Error) => toast.error(e.message) });
}

function TechPage() {
  const { tab = "inbox" } = Route.useSearch();
  const load = useServerFn(getTechWorkspace);
  const q = useQuery({ queryKey: ["tech-workspace"], queryFn: () => load() });
  const d = q.data;
  const inbox = d?.feedback.filter((f) => f.status === "received" || f.status === "needs_info") ?? [];
  const count: Partial<Record<Tab, number>> = d ? { inbox: inbox.length, backlog: d.backlog.filter((b) => b.roadmapColumn !== "done").length, bugs: d.softwareIssues.length, errors: d.errors.filter((e) => !e.backlogItemId).length } : {};
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl">Tech</h1><p className="mt-1 text-base text-muted-foreground">Everything people report, what we caught automatically, what we're building and what changed.</p></div>
        <Button asChild variant="outline"><Link to="/feedback" search={{ from: "/ops/tech" }}>Report something yourself</Link></Button>
      </header>
      <nav className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" aria-label="Tech sections">
        {TABS.map((t) => <Link key={t} to="/ops/tech" search={{ tab: t }} className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{TAB_LABEL[t]}{count[t] ? ` (${count[t]})` : ""}</Link>)}
      </nav>
      {q.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-destructive">{(q.error as Error).message}</p>}
      {d && !d.canManage && <p className="rounded-md bg-muted/50 p-3 text-sm">You can view everything here. Super Admin, Product Reviewers and the Tech team make changes.</p>}
      {d && tab === "inbox" && <Inbox d={d} items={inbox} />}
      {d && tab === "backlog" && <Backlog d={d} />}
      {d && tab === "roadmap" && <Roadmap d={d} />}
      {d && tab === "bugs" && <Bugs d={d} />}
      {d && tab === "errors" && <Errors d={d} />}
      {d && tab === "whats-new" && <WhatsNew d={d} />}
    </main>
  );
}
type D = Awaited<ReturnType<typeof getTechWorkspace>>;

function Inbox({ d, items }: { d: D; items: D["feedback"] }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? d.feedback : items;
  return <section className="space-y-3">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show every report, including decided ones</label>
    {!list.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">Nothing waiting. New reports from clients, investors and the team land here.</p>}
    {list.map((f) => <FeedbackCard key={f.id} f={f} d={d} />)}
  </section>;
}

function FeedbackCard({ f, d }: { f: D["feedback"][number]; d: D }) {
  const [mode, setMode] = useState<null | "accept" | "merge" | "needs_info" | "not_planned">(null);
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [existing, setExisting] = useState("");
  const triage = useServerFn(triageFeedback);
  const shot = useServerFn(getFeedbackScreenshot);
  const act = useAct(() => triage({ data: { id: f.id, action: mode!, note: note || null, mergeInto: mode === "merge" ? target : null, backlogItemId: mode === "accept" && existing ? existing : null } }), "Saved");
  const open = !["accepted", "merged", "released"].includes(f.status);
  return <article className="rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-lg">{f.title}</h2><p className="text-sm text-muted-foreground">{f.kind === "bug" ? "Bug" : "Idea"} · {AUDIENCE[f.audience]} · {f.reporterName} · {new Date(f.createdAt).toLocaleString()}{f.page ? ` · ${f.page}` : ""}</p></div>
      <Badge variant="secondary">{FEEDBACK_STATUS_LABEL[f.status as FeedbackStatus]}</Badge>
    </div>
    <p className="mt-2 whitespace-pre-wrap">{f.details}</p>
    {f.statusNote && <p className="mt-2 text-sm text-muted-foreground">Note: {f.statusNote}</p>}
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{f.browser && <span className="truncate">{f.browser}</span>}
      {f.hasScreenshot && <Button size="sm" variant="link" className="h-auto p-0" onClick={async () => { try { const r = await shot({ data: { id: f.id } }); window.open(r.url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); } }}>View screenshot</Button>}</div>
    {d.canManage && open && <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {([["accept", "Accept to backlog"], ["merge", "Combine with a duplicate"], ["needs_info", "Need more info"], ["not_planned", "Not planned"]] as const).map(([k, l]) => <Button key={k} size="sm" variant={mode === k ? "default" : "outline"} onClick={() => setMode(k)}>{l}</Button>)}
      </div>
      {mode && <div className="grid gap-2 sm:grid-cols-2">
        {mode === "accept" && <div className="space-y-1"><Label htmlFor={`ex-${f.id}`}>Add to</Label><select id={`ex-${f.id}`} className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={existing} onChange={(e) => setExisting(e.target.value)}><option value="">A new backlog item</option>{d.backlog.filter((b) => b.roadmapColumn !== "done").map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>}
        {mode === "merge" && <div className="space-y-1"><Label htmlFor={`mg-${f.id}`}>Same as</Label><select id={`mg-${f.id}`} className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a report</option>{d.feedback.filter((x) => x.id !== f.id && x.status !== "merged").map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></div>}
        <div className="space-y-1 sm:col-span-2"><Label htmlFor={`nt-${f.id}`}>{mode === "needs_info" || mode === "not_planned" ? "Message to the reporter" : "Note (optional)"}</Label><Textarea id={`nt-${f.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="flex gap-2 sm:col-span-2"><Button disabled={act.isPending} onClick={() => act.mutate(undefined)}>Save</Button><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button></div>
      </div>}
    </div>}
  </article>;
}

function BacklogEditor({ item, onDone }: { item?: D["backlog"][number]; onDone: () => void }) {
  const [f, setF] = useState({ kind: item?.kind ?? "enhancement", title: item?.title ?? "", summary: item?.summary ?? "", priority: item?.priority ?? "normal", area: item?.area ?? "general", roadmapColumn: item?.roadmapColumn ?? "later", targetMonth: item?.targetMonth ?? "" });
  const save = useServerFn(saveBacklogItem);
  const act = useAct(() => save({ data: { ...f, kind: f.kind as any, priority: f.priority as any, area: f.area as any, roadmapColumn: f.roadmapColumn as any, targetMonth: f.targetMonth || null, id: item?.id ?? null, expectedUpdatedAt: item?.updatedAt ?? null } }).then(onDone), "Saved");
  const sel = (id: string, label: string, value: string, opts: readonly string[], key: keyof typeof f, fmt: (v: string) => string = (v) => v[0]!.toUpperCase() + v.slice(1)) => (
    <div className="space-y-1"><Label htmlFor={id}>{label}</Label><select id={id} className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => setF({ ...f, [key]: e.target.value })}>{opts.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}</select></div>);
  return <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
    <div className="space-y-1 sm:col-span-3"><Label htmlFor="bl-title">Title</Label><Input id="bl-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
    <div className="space-y-1 sm:col-span-3"><Label htmlFor="bl-sum">Details</Label><Textarea id="bl-sum" rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
    {sel("bl-kind", "Type", f.kind, ["bug", "enhancement"], "kind")}
    {sel("bl-pri", "Priority", f.priority, PRIORITIES, "priority")}
    {sel("bl-area", "Area", f.area, AREAS, "area")}
    {sel("bl-col", "Roadmap", f.roadmapColumn, ROADMAP_COLUMNS, "roadmapColumn", (v) => ROADMAP_LABEL[v as RoadmapColumn])}
    <div className="space-y-1"><Label htmlFor="bl-month">Target month</Label><Input id="bl-month" type="month" value={f.targetMonth} onChange={(e) => setF({ ...f, targetMonth: e.target.value })} /></div>
    <div className="flex items-end gap-2"><Button disabled={act.isPending || f.title.trim().length < 3} onClick={() => act.mutate(undefined)}>Save</Button><Button variant="ghost" onClick={onDone}>Cancel</Button></div>
  </div>;
}

function BacklogRow({ b, d }: { b: D["backlog"][number]; d: D }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <BacklogEditor item={b} onDone={() => setEditing(false)} />;
  return <article className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3">
    <div className="min-w-0"><h3 className="text-base font-medium">{b.title}</h3>
      <p className="text-sm text-muted-foreground">{b.kind === "bug" ? "Bug" : "Enhancement"} · {b.area} · {ROADMAP_LABEL[b.roadmapColumn as RoadmapColumn]}{b.targetMonth ? ` · ${b.targetMonth}` : ""}{b.reports ? ` · ${b.reports} report${b.reports === 1 ? "" : "s"}` : ""} · from {b.source.replace("_", " ")}</p>
      {b.summary && <p className="mt-1 line-clamp-2 text-sm">{b.summary}</p>}
      {b.customServiceId && <Link to="/sales/custom-services" search={{ service: b.customServiceId }} className="text-sm underline">Open custom service</Link>}
      {b.softwareIssueId && <Link to="/ops/software-issues" search={{ issue: b.softwareIssueId }} className="text-sm underline">Open software issue</Link>}
    </div>
    <div className="flex items-center gap-2"><Badge variant={PRIORITY_VARIANT[b.priority]}>{b.priority}</Badge>{d.canManage && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}</div>
  </article>;
}

function Backlog({ d }: { d: D }) {
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const order = { urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>;
  const list = d.backlog.filter((b) => showDone || b.roadmapColumn !== "done").sort((a, b) => (order[a.priority]! - order[b.priority]!) || b.reports - a.reports);
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Include done</label>{d.canManage && !adding && <Button onClick={() => setAdding(true)}>Add item</Button>}</div>
    {adding && <BacklogEditor onDone={() => setAdding(false)} />}
    {!list.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">The backlog is empty.</p>}
    {list.map((b) => <BacklogRow key={b.id} b={b} d={d} />)}
  </section>;
}

function Roadmap({ d }: { d: D }) {
  const save = useServerFn(saveBacklogItem);
  const move = useAct((v: { b: D["backlog"][number]; to: RoadmapColumn }) => save({ data: { id: v.b.id, expectedUpdatedAt: v.b.updatedAt, kind: v.b.kind as any, title: v.b.title, summary: v.b.summary, priority: v.b.priority as any, area: v.b.area as any, roadmapColumn: v.to, targetMonth: v.b.targetMonth } }), "Moved");
  return <section className="grid gap-3 md:grid-cols-4">
    {ROADMAP_COLUMNS.map((c, ci) => <div key={c} className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <h2 className="text-lg">{ROADMAP_LABEL[c]} <span className="text-sm text-muted-foreground">({d.backlog.filter((b) => b.roadmapColumn === c).length})</span></h2>
      {d.backlog.filter((b) => b.roadmapColumn === c).slice(0, c === "done" ? 20 : 100).map((b) => <div key={b.id} className="rounded-lg border bg-card p-3 text-sm">
        <p className="font-medium">{b.title}</p><p className="text-xs text-muted-foreground">{b.kind === "bug" ? "Bug" : "Enhancement"} · {b.priority}{b.targetMonth ? ` · ${b.targetMonth}` : ""}</p>
        {d.canManage && c !== "done" && <div className="mt-2 flex gap-1">
          {ci > 0 && <Button size="sm" variant="ghost" aria-label={`Move ${b.title} to ${ROADMAP_LABEL[ROADMAP_COLUMNS[ci - 1]!]}`} onClick={() => move.mutate({ b, to: ROADMAP_COLUMNS[ci - 1]! })}>← {ROADMAP_LABEL[ROADMAP_COLUMNS[ci - 1]!]}</Button>}
          {ci < 2 && <Button size="sm" variant="ghost" aria-label={`Move ${b.title} to ${ROADMAP_LABEL[ROADMAP_COLUMNS[ci + 1]!]}`} onClick={() => move.mutate({ b, to: ROADMAP_COLUMNS[ci + 1]! })}>{ROADMAP_LABEL[ROADMAP_COLUMNS[ci + 1]!]} →</Button>}
        </div>}
      </div>)}
    </div>)}
    <p className="text-sm text-muted-foreground md:col-span-4">Items move to Done when a What's new note that includes them is published.</p>
  </section>;
}

function Bugs({ d }: { d: D }) {
  const add = useServerFn(addToBacklog);
  const act = useAct((id: string) => add({ data: { from: "software_issue", issueId: id } }), "Added to the backlog");
  return <section className="space-y-3">
    <p className="text-base">Fixes are tracked in <Link to="/ops/software-issues" search={{ issue: undefined }} className="underline">Software issues</Link> (technical owner, retest, resolve). Open ones are listed here so they show on the roadmap.</p>
    {!d.softwareIssues.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">No open software issues.</p>}
    {d.softwareIssues.map((i) => <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <Link to="/ops/software-issues" search={{ issue: i.id }} className="font-medium underline">{i.title}</Link>
      <div className="flex items-center gap-2"><Badge variant="secondary">{STAGE_LABEL[i.stage as IssueStage] ?? i.stage}</Badge>{i.onBacklog ? <Badge variant="outline">On the backlog</Badge> : d.canManage && <Button size="sm" variant="outline" onClick={() => act.mutate(i.id)}>Add to backlog</Button>}</div>
    </div>)}
  </section>;
}

function Errors({ d }: { d: D }) {
  const add = useServerFn(addToBacklog);
  const act = useAct((g: { message: string; page: string }) => add({ data: { from: "error", ...g } }), "Added to the backlog as a bug");
  return <section className="space-y-3">
    <p className="text-base text-muted-foreground">Page crashes caught automatically in the last 14 days, grouped by error and screen. No typed values or record details are kept. Slack gets a notice when one happens 5 or more times in an hour.</p>
    {!d.errors.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">No errors caught in the last 14 days.</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-3">Error</th><th className="py-2 pr-3">Screen</th><th className="py-2 pr-3 text-right">Times</th><th className="py-2 pr-3 text-right">People</th><th className="py-2 pr-3">Last seen</th><th /></tr></thead>
      <tbody>{d.errors.map((g) => <tr key={g.fingerprint} className="border-t align-top">
        <td className="py-2 pr-3">{g.message}{g.lastHour >= 5 && <Badge variant="destructive" className="ml-2">Spiking</Badge>}</td><td className="py-2 pr-3 font-mono text-xs">{g.page}</td>
        <td className="py-2 pr-3 text-right">{g.count}</td><td className="py-2 pr-3 text-right">{g.people}</td><td className="py-2 pr-3">{new Date(g.lastSeen).toLocaleString()}</td>
        <td className="py-2">{g.backlogItemId ? <Badge variant="outline">On the backlog</Badge> : d.canManage && <Button size="sm" variant="outline" onClick={() => act.mutate({ message: g.message, page: g.page })}>Add to backlog</Button>}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

function WhatsNew({ d }: { d: D }) {
  const [writing, setWriting] = useState(false);
  const [f, setF] = useState({ title: "", body: "", audience: "staff" as "staff" | "clients", itemIds: [] as string[] });
  const saveFn = useServerFn(saveReleaseNote);
  const pubFn = useServerFn(publishReleaseNote);
  const save = useAct(() => saveFn({ data: f }).then(() => { setWriting(false); setF({ title: "", body: "", audience: "staff", itemIds: [] }); }), "Draft saved");
  const pub = useAct((id: string) => pubFn({ data: { id } }), "Published. Linked items moved to Done and their reporters see Released.");
  const title = (id: string) => d.backlog.find((b) => b.id === id)?.title ?? "Item";
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><p className="text-base text-muted-foreground">What changed on the platform. Publishing shows it in the app only; no emails are sent.</p>{d.canManage && !writing && <Button onClick={() => setWriting(true)}>Write an update</Button>}</div>
    {writing && <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1"><Label htmlFor="rn-title">Title</Label><Input id="rn-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Faster investor document uploads" /></div>
      <div className="space-y-1"><Label htmlFor="rn-body">What changed</Label><Textarea id="rn-body" rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="rn-aud">Who sees it</Label><select id="rn-aud" className="h-10 rounded-md border bg-background px-2 text-sm" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as any })}><option value="staff">Harmonious staff only</option><option value="clients">Also shown to clients and investors</option></select></div>
      <fieldset className="space-y-1"><legend className="text-sm font-medium">Backlog items this closes</legend>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">{d.backlog.filter((b) => b.roadmapColumn !== "done").map((b) => <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.itemIds.includes(b.id)} onChange={(e) => setF({ ...f, itemIds: e.target.checked ? [...f.itemIds, b.id] : f.itemIds.filter((x) => x !== b.id) })} />{b.title}</label>)}{!d.backlog.some((b) => b.roadmapColumn !== "done") && <p className="text-sm text-muted-foreground">No open items.</p>}</div>
      </fieldset>
      <div className="flex gap-2"><Button disabled={save.isPending || f.title.trim().length < 3 || f.body.trim().length < 5} onClick={() => save.mutate(undefined)}>Save draft</Button><Button variant="ghost" onClick={() => setWriting(false)}>Cancel</Button></div>
    </div>}
    {!d.releaseNotes.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">No updates yet.</p>}
    {d.releaseNotes.map((n) => <article key={n.id} className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-xl">{n.title}</h2><div className="flex gap-1"><Badge variant="outline">{n.audience === "clients" ? "Shown to clients" : "Staff only"}</Badge><Badge variant={n.publishedAt ? "default" : "secondary"}>{n.publishedAt ? `Published ${new Date(n.publishedAt).toLocaleDateString()}` : "Draft"}</Badge></div></div>
      <p className="mt-2 whitespace-pre-wrap">{n.body}</p>
      {!!n.itemIds.length && <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{n.itemIds.map((i) => <li key={i}>{title(i)}</li>)}</ul>}
      <p className="mt-2 text-xs text-muted-foreground">Written by {n.createdByName}{n.publishedByName ? ` · published by ${n.publishedByName}` : ""}</p>
      {d.canManage && !n.publishedAt && <Button className="mt-3" onClick={() => { if (window.confirm("Publish this update? It can't be edited afterwards.")) pub.mutate(n.id); }}>Publish</Button>}
    </article>)}
  </section>;
}
