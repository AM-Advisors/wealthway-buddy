import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { approveLivePublishing, chooseSearchProperty, getPerformance, getPublishingMode, requestLivePublishing, returnToTestPublishing } from "@/lib/marketing-perf.functions";
import { compare, fmt, rate, type PostPerf } from "@/lib/marketing-perf-model";

export const Route = createFileRoute("/_authenticated/marketing_/performance")({
  head: mkHead("Publishing & performance", "Controlled publishing queue, live-mode approval and source-reported marketing performance."),
  component: Page,
});

const NA = "Not available";
const STATUS: Record<string, string> = { pending: "Queued", publishing: "Publishing", submitted: "Submitted — awaiting platform confirmation", published: "Published (confirmed)", failed: "Failed", test_passed: "Test passed (not public)" };

function Page() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<"queue" | "dashboard" | "search" | "weekly">("queue");
  const load = useServerFn(getPerformance), mode = useServerFn(getPublishingMode);
  const q = useQuery({ queryKey: ["perf", days], queryFn: () => load({ data: { days } }) });
  const mq = useQuery({ queryKey: ["pub-mode"], queryFn: () => mode() });
  const d: any = q.data;
  return (
    <MkPage title="Publishing & performance" intro="Approved posts publish through the queue. Numbers come only from the platforms and Search Console; anything they don't report shows as Not available.">
      <div className="space-y-4">
        <ModePanel m={mq.data} />
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {(["queue", "dashboard", "search", "weekly"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{{ queue: "Queue & log", dashboard: "Social performance", search: "Search & website", weekly: "Weekly recommendations" }[t]}</button>)}
          <select className="ml-auto rounded-md border border-input bg-background px-2 py-1 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((n) => <option key={n} value={n}>Last {n} days</option>)}</select>
        </div>
        {!d ? <p className="text-sm text-muted-foreground">{q.error ? (q.error as Error).message : "Loading…"}</p> : <>
          {tab === "queue" && <Queue d={d} />}
          {tab === "dashboard" && <Social perf={d.perf} />}
          {tab === "search" && <Search d={d} />}
          {tab === "weekly" && <Weekly d={d} />}
        </>}
      </div>
    </MkPage>
  );
}

function ModePanel({ m }: { m: any }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const req = useServerFn(requestLivePublishing), ok = useServerFn(approveLivePublishing), back = useServerFn(returnToTestPublishing);
  if (!m) return null;
  const act = async (fn: () => Promise<any>, msg: string) => { try { await fn(); toast.success(msg); setReason(""); qc.invalidateQueries({ queryKey: ["pub-mode"] }); } catch (e: any) { toast.error(e.message); } };
  const live = m.mode === "live";
  return (
    <div className={`space-y-2 rounded-md border p-3 ${live ? "border-primary" : "border-border bg-muted"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-sm">{live ? "LIVE publishing is on" : "TEST mode — nothing is posted publicly"}</b>
        {live && m.canRequest && <Button size="sm" variant="outline" onClick={() => act(() => back(), "Back in test mode")}>Return to test mode</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{live
        ? `Approved by ${m.approved_by === m.me ? "you" : "an executive approver"} on ${new Date(m.approved_at).toLocaleString()}: ${m.approval_reason}`
        : "In test mode, Facebook receives a hidden (unpublished) Page post and Instagram content is checked without posting. Live publishing needs a request and a second person's approval."}</p>
      {!live && <div className="flex flex-wrap gap-2">
        <input className="min-w-64 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {!m.requested_by && m.canRequest && <Button size="sm" onClick={() => act(() => req({ data: { reason } }), "Live publishing requested")}>Request live publishing</Button>}
        {m.requested_by && <span className="self-center text-xs">Requested {new Date(m.requested_at).toLocaleString()}: {m.request_reason}</span>}
        {m.requested_by && m.canApprove && <Button size="sm" onClick={() => act(() => ok({ data: { reason } }), "Live publishing is on")}>Approve live publishing</Button>}
      </div>}
    </div>
  );
}

function Queue({ d }: { d: any }) {
  const byPost = new Map<string, any[]>(); for (const t of d.targets) byPost.set(t.post_id, [...(byPost.get(t.post_id) ?? []), t]);
  return <div className="space-y-4">
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Queue</h3>
      {!d.queue.length && <p className="text-xs text-muted-foreground">Nothing approved or waiting.</p>}
      {d.queue.map((p: any) => <div key={p.id} className="rounded-md border border-border p-2 text-xs">
        <div className="flex flex-wrap justify-between gap-2"><b>{p.title}</b><span>{p.status}{p.scheduled_at ? ` · ${new Date(p.scheduled_at).toLocaleString()}` : ""} · {(p.image_paths ?? []).length} media</span></div>
        {(byPost.get(p.id) ?? []).map((t) => <div key={t.id} className={t.status === "failed" ? "text-destructive" : ""}>{t.channel}: {STATUS[t.status] ?? t.status}{t.attempts ? ` · ${t.attempts} attempt(s)` : ""}{t.error ? ` · ${t.error}` : ""}</div>)}
        {p.status === "failed" && <div className="text-muted-foreground">Use Retry publishing on the post (Marketing → Social posts). Only failed channels re-publish; confirmed ones are never reposted.</div>}
      </div>)}
    </section>
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">Publishing log (append-only)</h3>
      {d.attempts.map((a: any) => <div key={a.id} className="text-xs">{new Date(a.created_at).toLocaleString()} · {a.mode.toUpperCase()} · {a.channel} · {a.action} → <b>{a.result}</b>{a.permalink && <> · <a className="underline" href={a.permalink} target="_blank" rel="noreferrer">view</a></>}{a.error ? ` · ${a.error}` : ""}</div>)}
      {!d.attempts.length && <p className="text-xs text-muted-foreground">No attempts yet.</p>}
    </section>
  </div>;
}

function Social({ perf }: { perf: PostPerf[] }) {
  const [dim, setDim] = useState<"series" | "day" | "topic" | "format" | "channel">("series");
  const all = compare(perf, "channel");
  const tot = (k: keyof (typeof all)[number]) => { const v = all.map((r) => r[k] as number | null).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + (b as number), 0) : null; };
  const imp = tot("impressions"), reach = tot("reach"), eng = tot("engagement"), clicks = tot("clicks");
  const rows = compare(perf, dim);
  if (!perf.length) return <p className="text-sm text-muted-foreground">No platform-confirmed posts in this period yet. Metrics appear after live posts publish and the daily refresh runs.</p>;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {[["Impressions", fmt(imp)], ["Reach", fmt(reach)], ["Engagement rate", fmt(rate(eng, reach ?? imp), true)], ["Comments", fmt(tot("comments"))], ["Shares", fmt(tot("shares"))], ["Saves", fmt(tot("saves"))], ["Link clicks", fmt(clicks)], ["CTR", fmt(rate(clicks, imp), true)]].map(([k, v]) =>
        <div key={k} className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">{k}</div><div className={`text-lg font-semibold ${v === NA ? "text-muted-foreground text-sm" : ""}`}>{v}</div></div>)}
    </div>
    <p className="text-[11px] text-muted-foreground">Instagram doesn't report link clicks and Facebook doesn't report saves through the API, so those show Not available rather than 0.</p>
    <div className="flex items-center gap-2 text-xs">Compare by <select className="rounded-md border border-input bg-background px-2 py-1" value={dim} onChange={(e) => setDim(e.target.value as any)}>{["series", "day", "topic", "format", "channel"].map((x) => <option key={x}>{x}</option>)}</select></div>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground">{["", "Posts", "Impressions", "Reach", "Eng. rate", "Clicks", "CTR", "Comments", "Shares", "Saves"].map((h) => <th key={h} className="p-1">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-border"><td className="p-1 font-medium">{r.key.replace(/_/g, " ")}</td><td className="p-1">{r.posts}</td><td className="p-1">{fmt(r.impressions)}</td><td className="p-1">{fmt(r.reach)}</td><td className="p-1">{fmt(r.engagementRate, true)}</td><td className="p-1">{fmt(r.clicks)}</td><td className="p-1">{fmt(r.ctr, true)}</td><td className="p-1">{fmt(r.comments)}</td><td className="p-1">{fmt(r.shares)}</td><td className="p-1">{fmt(r.saves)}</td></tr>)}</tbody></table></div>
  </div>;
}

function Search({ d }: { d: any }) {
  const qc = useQueryClient(); const choose = useServerFn(chooseSearchProperty);
  const [pick, setPick] = useState("");
  const rows = d.search as any[];
  const clicks = rows.length ? rows.reduce((a, r) => a + r.clicks, 0) : null, imps = rows.length ? rows.reduce((a, r) => a + r.impressions, 0) : null;
  const kw = new Map<string, { c: number; i: number; p: number[] }>(); for (const r of rows) { const x = kw.get(r.query) ?? { c: 0, i: 0, p: [] }; x.c += r.clicks; x.i += r.impressions; x.p.push(r.position); kw.set(r.query, x); }
  const top = [...kw].sort((a, b) => b[1].i - a[1].i).slice(0, 25);
  const bySrc = new Map<string, number>(); for (const l of d.leads.rows) bySrc.set(l.utm_source || "(no UTM)", (bySrc.get(l.utm_source || "(no UTM)") ?? 0) + 1);
  return <div className="space-y-4">
    <section className="space-y-2 rounded-md border border-border p-3">
      <h3 className="text-sm font-semibold">Google Search Console</h3>
      {d.propError ? <p className="text-xs text-destructive">{d.propError}</p> : <>
        <p className="text-xs">Property: <b>{d.settings?.site_url ?? "none chosen"}</b>{d.settings?.last_refresh_at ? ` · refreshed ${new Date(d.settings.last_refresh_at).toLocaleString()}` : ""}{d.settings?.last_error ? ` · last error: ${d.settings.last_error}` : ""}</p>
        <div className="flex gap-2"><select className="rounded-md border border-input bg-background px-2 py-1 text-xs" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose a verified property…</option>{d.properties.map((p: string) => <option key={p}>{p}</option>)}</select>
          <Button size="sm" variant="outline" disabled={!pick} onClick={async () => { try { await choose({ data: { siteUrl: pick } }); toast.success("Property saved and refreshed"); qc.invalidateQueries({ queryKey: ["perf"] }); } catch (e: any) { toast.error(e.message); } }}>Use this property</Button></div>
        {!d.properties.some((p: string) => p.includes("harmonious.co") && !p.includes("onboard")) && <p className="text-[11px] text-muted-foreground">harmonious.co itself isn't a verified property on this Google account, so article search data for the main site is Not available until it's verified.</p>}
      </>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-xs">
        <div>Search impressions: <b>{fmt(imps)}</b></div><div>Search clicks: <b>{fmt(clicks)}</b></div><div>Search CTR: <b>{fmt(rate(clicks, imps), true)}</b></div><div>Keywords tracked: <b>{rows.length ? kw.size : NA}</b></div>
      </div>
      {!!top.length && <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th>Query</th><th>Impressions</th><th>Clicks</th><th>Avg position</th></tr></thead><tbody>{top.map(([k, v]) => <tr key={k} className="border-t border-border"><td>{k}</td><td>{v.i}</td><td>{v.c}</td><td>{(v.p.reduce((a, b) => a + b, 0) / v.p.length).toFixed(1)}</td></tr>)}</tbody></table>}
    </section>
    <section className="space-y-1 rounded-md border border-border p-3 text-xs">
      <h3 className="text-sm font-semibold">Website & leads</h3>
      <div>Website sessions: <b>{d.ga4 ? "Connected — reporting coming next" : NA}</b>{!d.ga4 && " (Google Analytics 4 isn't connected)"}</div>
      <div>Leads (website forms): <b>{d.leads.total}</b> · with UTM attribution: <b>{d.leads.attributed}</b></div>
      <div>Qualified leads: <b>{NA}</b> (no qualification status is recorded on website leads yet)</div>
      <div>Conversion rate: <b>{NA}</b> (needs website sessions) · Assisted conversions: <b>{NA}</b> (needs GA4)</div>
      {[...bySrc].map(([k, v]) => <div key={k}>{k}: {v}</div>)}
      <p className="text-[11px] text-muted-foreground">Harmonious links in posts get UTM tags at publish time: source = platform, medium = social, campaign = campaign or series, content = article, term = series.</p>
    </section>
  </div>;
}

function Weekly({ d }: { d: any }) {
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Calculated from stored platform and Search Console data only; nothing is estimated or invented.</p>
    {d.recommendations.map((r: any) => <div key={r.question} className="rounded-md border border-border p-3"><b className="text-sm">{r.question}</b><ul className="list-disc pl-4 text-xs">{r.answers.map((a: string) => <li key={a}>{a}</li>)}</ul><p className="mt-1 text-[11px] text-muted-foreground">{r.basis}</p></div>)}
  </div>;
}
