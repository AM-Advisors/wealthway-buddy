import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import {
  createLinkedInPersonalPost, disconnectLinkedInPersonal, editLinkedInPersonalPost, getLinkedInPersonal,
  linkedInPersonalPostAction, revokeLinkedInDelegate, setLinkedInDelegate, startLinkedInPersonalConnect,
} from "@/lib/linkedin-personal.functions";

export const Route = createFileRoute("/_authenticated/marketing_/linkedin")({
  head: mkHead("LinkedIn accounts", "Connect a personal LinkedIn profile and manage who may draft, schedule and publish on it."),
  component: Page,
});

const TABS = { accounts: "Connected accounts", access: "Authorized team & permissions", pending: "Pending my approval", posts: "Posts", activity: "Account activity" } as const;
const STATUS: Record<string, string> = { draft: "Draft", in_review: "In review", changes_requested: "Changes requested", approved: "Approved", scheduled: "Scheduled", publishing: "Publishing", published: "Published", failed: "Failed", cancelled: "Cancelled", rejected: "Rejected" };
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");

function Page() {
  const load = useServerFn(getLinkedInPersonal);
  const q = useQuery({ queryKey: ["li-personal"], queryFn: () => load() });
  const [tab, setTab] = useState<keyof typeof TABS>("accounts");
  useEffect(() => {
    const u = new URL(window.location.href);
    const s = u.searchParams.get("linkedin");
    if (s === "connected") toast.success("LinkedIn profile connected.");
    if (s === "error") toast.error(u.searchParams.get("msg") ?? "LinkedIn connection failed.");
  }, []);
  const d: any = q.data;
  return (
    <MkPage title="LinkedIn accounts" intro="Personal profile posts are separate from Harmonious company-page posts. Only the profile owner can connect it or decide who may use it.">
      {!d ? <p className="text-sm text-muted-foreground">{q.error ? (q.error as Error).message : "Loading…"}</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 border-b border-border">
            {(Object.keys(TABS) as (keyof typeof TABS)[]).filter((t) => d.isOwner || !["access", "pending"].includes(t)).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{TABS[t]}</button>
            ))}
          </div>
          {tab === "accounts" && <Accounts d={d} />}
          {tab === "access" && d.isOwner && <Access d={d} />}
          {tab === "pending" && d.isOwner && <Posts d={d} only={["in_review"]} />}
          {tab === "posts" && (d.access ? <><Composer d={d} /><Posts d={d} /></> : <p className="text-sm text-muted-foreground">{d.reason}</p>)}
          {tab === "activity" && <Activity d={d} />}
        </div>
      )}
    </MkPage>
  );
}

function Accounts({ d }: { d: any }) {
  const qc = useQueryClient();
  const start = useServerFn(startLinkedInPersonalConnect), disc = useServerFn(disconnectLinkedInPersonal);
  const a = d.account;
  const expired = a.expires_at && new Date(a.expires_at) <= new Date();
  const health = a.status === "connected" && !expired ? "Healthy" : a.status === "connected" ? "Reauthorization required (expired)" : a.status === "reauthorization_required" ? "Reauthorization required" : "Not connected";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold">My personal LinkedIn</h3><span className="rounded bg-accent/20 px-2 py-0.5 text-xs">Personal profile</span></div>
        <p className="text-xs text-muted-foreground">Owner: {d.ownerName}</p>
        {a.has_token ? (
          <div className="flex items-center gap-3">
            {a.picture_url && <img src={a.picture_url} alt="" className="h-12 w-12 rounded-full" />}
            <div><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.profile_url ?? "Profile link isn't provided by LinkedIn sign-in"}</p></div>
          </div>
        ) : <p className="text-sm text-muted-foreground">No LinkedIn profile connected.</p>}
        <dl className="grid grid-cols-2 gap-1 text-xs">
          <dt className="text-muted-foreground">Connection health</dt><dd>{health}</dd>
          <dt className="text-muted-foreground">Last authorized</dt><dd>{dt(a.last_authorized_at)}</dd>
          <dt className="text-muted-foreground">Authorization expires</dt><dd>{dt(a.expires_at)}</dd>
          <dt className="text-muted-foreground">Permissions granted</dt><dd>{a.scopes || "—"}</dd>
          {a.last_error && <><dt className="text-muted-foreground">Last problem</dt><dd className="text-destructive">{a.last_error}</dd></>}
        </dl>
        {!d.appConfigured && <p className="text-xs text-destructive">The LinkedIn developer app credentials aren't saved.</p>}
        {d.isOwner ? (
          <div className="flex gap-2">
            <Button onClick={async () => { try { window.location.href = (await start()).url; } catch (e) { toast.error((e as Error).message); } }}>{a.has_token ? "Reconnect" : "Connect Personal LinkedIn"}</Button>
            {a.has_token && <Button variant="outline" onClick={async () => { if (!confirm("Disconnect your LinkedIn profile? Scheduled posts will be unscheduled.")) return; await disc(); qc.invalidateQueries({ queryKey: ["li-personal"] }); }}>Disconnect</Button>}
          </div>
        ) : <p className="text-xs text-muted-foreground">Only {d.ownerName} can connect, reconnect or disconnect this profile.</p>}
      </section>
      <section className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Harmonious company page</h3><span className="rounded bg-primary/10 px-2 py-0.5 text-xs">Company page</span></div>
        <p className="text-sm text-muted-foreground">Managed separately in Marketing → Channels. Company-page access never grants access to a personal profile.</p>
      </section>
      {!d.isOwner && d.myGrant && <section className="rounded-lg border border-border p-4 md:col-span-2 text-sm">
        <h3 className="font-semibold mb-1">My access</h3>
        <p className="text-muted-foreground">{d.perms.filter((p: any) => d.myGrant.perms?.[p.key]).map((p: any) => p.label).join(", ") || "None"}{d.myGrant.suspended ? " (suspended)" : ""}{d.myGrant.revoked_at ? " (revoked)" : ""}</p>
      </section>}
    </div>
  );
}

function Access({ d }: { d: any }) {
  const [pick, setPick] = useState("");
  const rows = [...d.delegates.filter((x: any) => !x.revoked_at), ...(pick && !d.delegates.some((x: any) => x.delegate_user_id === pick && !x.revoked_at) ? [{ delegate_user_id: pick, perms: {}, _new: true }] : [])];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <select className="rounded-md border border-input bg-background px-2 py-1 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Add a Harmonious employee…</option>
          {d.staff.map((s: any) => <option key={s.user_id} value={s.user_id}>{s.legal_name || s.email}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Every permission starts off. Delegates can never add others or raise their own access.</span>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No one has access to your profile.</p>}
      {rows.map((r: any) => <DelegateRow key={r.delegate_user_id} d={d} r={r} name={d.names[r.delegate_user_id] ?? d.staff.find((s: any) => s.user_id === r.delegate_user_id)?.legal_name ?? "Employee"} onDone={() => setPick("")} />)}
    </div>
  );
}

function DelegateRow({ d, r, name, onDone }: { d: any; r: any; name: string; onDone: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(setLinkedInDelegate), revoke = useServerFn(revokeLinkedInDelegate);
  const [perms, setPerms] = useState<Record<string, boolean>>(r.perms ?? {});
  const [lim, setLim] = useState({ expires_at: r.expires_at?.slice(0, 10) ?? "", max: r.max_posts_per_day ?? "", series: (r.series ?? []).join(", "), hs: r.hours_start ?? "", he: r.hours_end ?? "", suspended: !!r.suspended });
  const refresh = () => qc.invalidateQueries({ queryKey: ["li-personal"] });
  const submit = async () => {
    let authorizeDirect = false;
    if (perms.publish_direct && !r.direct_publish_authorized_at) {
      authorizeDirect = confirm(`Authorize ${name} to publish on your personal LinkedIn WITHOUT your approval of each post? You can revoke this at any time.`);
      if (!authorizeDirect) return;
    }
    try {
      await save({ data: { delegateId: r.delegate_user_id, perms, authorizeDirect, expires_at: lim.expires_at ? new Date(lim.expires_at).toISOString() : null, max_posts_per_day: lim.max === "" ? null : Number(lim.max), series: lim.series ? lim.series.split(",").map((x: string) => x.trim()).filter(Boolean) : null, hours_start: lim.hs === "" ? null : Number(lim.hs), hours_end: lim.he === "" ? null : Number(lim.he), suspended: lim.suspended } });
      toast.success("Access saved."); onDone(); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const inp = "rounded-md border border-input bg-background px-2 py-1 text-xs";
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between"><p className="font-medium">{name}{r.suspended ? " · Suspended" : ""}</p>
        {!r._new && <Button size="sm" variant="outline" onClick={async () => { if (confirm(`Revoke all of ${name}'s access?`)) { await revoke({ data: { delegateId: r.delegate_user_id } }); refresh(); } }}>Revoke</Button>}</div>
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {d.perms.map((p: any) => (
          <label key={p.key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!perms[p.key]} onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })} />{p.label}{p.key === "publish_direct" && r.direct_publish_authorized_at ? " (authorized)" : ""}</label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <label>Expires <input type="date" className={inp} value={lim.expires_at} onChange={(e) => setLim({ ...lim, expires_at: e.target.value })} /></label>
        <label>Max posts/day <input type="number" min={1} className={`${inp} w-16`} value={lim.max} onChange={(e) => setLim({ ...lim, max: e.target.value })} /></label>
        <label>Series <input className={inp} placeholder="any" value={lim.series} onChange={(e) => setLim({ ...lim, series: e.target.value })} /></label>
        <label>Hours (Denver) <input type="number" min={0} max={23} className={`${inp} w-14`} value={lim.hs} onChange={(e) => setLim({ ...lim, hs: e.target.value })} />–<input type="number" min={0} max={24} className={`${inp} w-14`} value={lim.he} onChange={(e) => setLim({ ...lim, he: e.target.value })} /></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={lim.suspended} onChange={(e) => setLim({ ...lim, suspended: e.target.checked })} />Suspend</label>
        <Button size="sm" onClick={submit}>Save</Button>
      </div>
    </div>
  );
}

function Composer({ d }: { d: any }) {
  const qc = useQueryClient();
  const create = useServerFn(createLinkedInPersonalPost);
  const [body, setBody] = useState(""), [series, setSeries] = useState("");
  const can = d.isOwner || d.myGrant?.perms?.create;
  if (!can) return null;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-sm font-medium">New post for {d.ownerName}'s personal profile</p>
      <textarea className="w-full rounded-md border border-input bg-background p-2 text-sm" rows={4} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2"><input className="rounded-md border border-input bg-background px-2 py-1 text-xs" placeholder="Series (optional)" value={series} onChange={(e) => setSeries(e.target.value)} />
        <Button size="sm" disabled={!body.trim()} onClick={async () => { try { await create({ data: { body, series: series || null } }); setBody(""); qc.invalidateQueries({ queryKey: ["li-personal"] }); } catch (e) { toast.error((e as Error).message); } }}>Save draft</Button></div>
    </div>
  );
}

function Posts({ d, only }: { d: any; only?: string[] }) {
  const posts = d.posts.filter((p: any) => !only || only.includes(p.status));
  if (!posts.length) return <p className="text-sm text-muted-foreground">Nothing here.</p>;
  const groups = only ? [["", posts]] : [["Drafts & review", posts.filter((p: any) => ["draft", "in_review", "changes_requested", "rejected"].includes(p.status))], ["Approved & scheduled", posts.filter((p: any) => ["approved", "scheduled", "publishing", "failed"].includes(p.status))], ["Published", posts.filter((p: any) => p.status === "published")], ["Cancelled", posts.filter((p: any) => p.status === "cancelled")]];
  return <div className="space-y-4">{groups.map(([t, list]: any) => list.length ? <div key={t} className="space-y-2">{t && <h3 className="text-sm font-semibold">{t}</h3>}{list.map((p: any) => <PostCard key={p.id} d={d} p={p} />)}</div> : null)}</div>;
}

function PostCard({ d, p }: { d: any; p: any }) {
  const qc = useQueryClient();
  const act = useServerFn(linkedInPersonalPostAction), edit = useServerFn(editLinkedInPersonalPost);
  const [body, setBody] = useState(p.body), [at, setAt] = useState("");
  const g = d.myGrant?.perms ?? {};
  const own = d.isOwner, locked = ["published", "publishing"].includes(p.status);
  const run = async (action: any, extra: any = {}) => { try { const r: any = await act({ data: { id: p.id, action, ...extra } }); if (r?.test) toast.info("Test mode: all checks passed; nothing was posted."); qc.invalidateQueries({ queryKey: ["li-personal"] }); } catch (e) { toast.error((e as Error).message); } };
  const approvedNow = p.approved_version === p.version;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded bg-accent/20 px-2 py-0.5">Personal profile</span><span className="font-medium">{STATUS[p.status]}</span><span className="text-muted-foreground">v{p.version}{approvedNow ? " · approved" : ""} · by {d.names[p.author_id] ?? "—"}{p.scheduled_at ? ` · scheduled ${dt(p.scheduled_at)}` : ""}{p.series_key ? ` · ${p.series_key}` : ""}</span></div>
      {!locked && (own || g.edit) ? <textarea className="w-full rounded-md border border-input bg-background p-2" rows={3} value={body} onChange={(e) => setBody(e.target.value)} /> : <p className="whitespace-pre-wrap">{p.body}</p>}
      {p.error && <p className="text-xs text-muted-foreground">{p.error}</p>}
      {p.linkedin_post_id && <p className="text-xs">LinkedIn post {p.linkedin_post_id} · {dt(p.published_at)}</p>}
      {!locked && <div className="flex flex-wrap gap-2 items-center">
        {body !== p.body && <Button size="sm" variant="outline" onClick={async () => { try { await edit({ data: { id: p.id, body } }); qc.invalidateQueries({ queryKey: ["li-personal"] }); if (approvedNow) toast.info("Edited — approval cleared; it needs review again."); } catch (e) { toast.error((e as Error).message); } }}>Save edit{approvedNow ? " (needs reapproval)" : ""}</Button>}
        {["draft", "changes_requested"].includes(p.status) && (own || g.submit) && <Button size="sm" variant="outline" onClick={() => run("submit")}>Submit for approval</Button>}
        {own && p.status === "in_review" && <><Button size="sm" onClick={() => run("approve")}>Approve</Button><Button size="sm" variant="outline" onClick={() => run("request_changes", { note: prompt("What should change?") })}>Request edits</Button><Button size="sm" variant="outline" onClick={() => run("reject")}>Reject</Button></>}
        {(own || g.schedule || g.propose_schedule) && ["approved", "in_review", "draft"].includes(p.status) && <><input type="datetime-local" className="rounded-md border border-input bg-background px-2 py-1 text-xs" value={at} onChange={(e) => setAt(e.target.value)} />
          {(own || (g.schedule && p.status === "approved")) && <Button size="sm" variant="outline" disabled={!at} onClick={() => run("schedule", { at: new Date(at).toISOString() })}>Schedule</Button>}
          {!own && g.propose_schedule && <Button size="sm" variant="outline" disabled={!at} onClick={() => run("propose_schedule", { at: new Date(at).toISOString() })}>Propose time</Button>}</>}
        {p.status === "scheduled" && (own || g.schedule) && <Button size="sm" variant="outline" onClick={() => run("cancel_schedule")}>Cancel schedule</Button>}
        {(own || (g.publish_approved && approvedNow && ["approved", "scheduled", "failed"].includes(p.status)) || g.publish_direct) && <Button size="sm" onClick={() => { if (confirm("Publish to the personal LinkedIn profile now?")) run("publish_now"); }}>Publish now</Button>}
        {own && p.status !== "cancelled" && <Button size="sm" variant="ghost" onClick={() => run("cancel")}>Cancel post</Button>}
      </div>}
    </div>
  );
}

function Activity({ d }: { d: any }) {
  if (!d.events.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1">When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
      <tbody>{d.events.map((e: any) => <tr key={e.id} className="border-t border-border"><td className="py-1">{dt(e.created_at)}</td><td>{d.names[e.actor_id] ?? "Scheduler"}</td><td>{e.action.replace(/_/g, " ")}{e.delegate_user_id ? ` · ${d.names[e.delegate_user_id] ?? ""}` : ""}{e.version ? ` · v${e.version}` : ""}</td><td className="text-muted-foreground">{e.detail?.reason ?? e.detail?.error ?? e.detail?.linkedin_post_id ?? e.detail?.note ?? ""}</td></tr>)}</tbody></table>
  );
}
