import { useOrgTz } from "@/components/marketing/use-org-tz";
import { fmtInTz } from "@/lib/org-timezone";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { SeriesChip, useStudio, type Series } from "@/components/marketing/studio";
import { ackResearchAlert, addResearchStory, convertResearchIdea, dismissResearchStory, getResearchFeed, runResearchNow } from "@/lib/marketing-research.functions";
import { CATEGORIES, categorize, freshnessWarning, usd, EXEMPTION_LABEL, issuerCategory, type Category, FORMD_FIELD, fmtFormDAmount } from "@/lib/marketing-formd-model";
import { getFormDIntel } from "@/lib/marketing-research.functions";
import { CLAIM_LABEL, SCORE_WEIGHTS, type ClaimKind } from "@/lib/marketing-research-model";

export const Route = createFileRoute("/_authenticated/marketing_/studio_/research")({
  head: mkHead("Research feed", "Ranked, source-backed research and suggested article ideas for the Harmonious editorial series."),
  component: ResearchPage,
});

const VERIFY: Record<string, string> = { verified_primary: "Primary source", reported: "Reported (secondary)", unverified: "Unverified", not_applicable: "" };
const vTone = (v: string) => v === "verified_primary" ? "bg-primary text-primary-foreground" : v === "unverified" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground";

function ResearchPage() {
  const tz = useOrgTz();
  const [days, setDays] = useState(3);
  const [tab, setTab] = useState<"feed" | "formd" | "ideas" | "sources">("feed");
  const [cat, setCat] = useState<Category | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useServerFn(getResearchFeed), run = useServerFn(runResearchNow), dismiss = useServerFn(dismissResearchStory);
  const ack = useServerFn(ackResearchAlert), convert = useServerFn(convertResearchIdea), add = useServerFn(addResearchStory);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["research", days], queryFn: () => load({ data: { days } }) });
  const studio = useStudio(new Date(), new Date(Date.now() + 86400000));
  const series = (studio.data?.series ?? []) as Series[];
  const byKey = Object.fromEntries(series.map((s) => [s.key, s]));
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["research"] });
  const act = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); refresh(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } };
  const sel = "rounded-md border border-input bg-background px-2 py-1 text-xs";

  return (
    <MkPage title="Research feed" intro="Ranked stories from official sources and suggested ideas per series. Nothing here is ever published automatically."
      actions={<div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><Link to="/marketing/studio">Studio</Link></Button>
        <Button variant="outline" disabled={busy} onClick={() => act(() => run({ data: { ideas: false } }), "Feeds refreshed")}>Refresh feeds</Button>
        <Button disabled={busy} onClick={() => act(() => run({ data: { ideas: true } }), "Feeds refreshed and ideas suggested")}>Suggest ideas</Button>
      </div>}>
      {d?.paused && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">Automatic research is paused: {d.paused}. Press Refresh feeds to try again once that's fixed.</p>}

      {!!d?.alerts.length && (
        <section className="space-y-2 rounded-lg border border-accent bg-accent/10 p-3">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wider">Alerts — review only, nothing is published</h2>
          {d.alerts.map((a: any) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{a.reason}:</span><a className="underline" href={a.story?.url} target="_blank" rel="noreferrer">{a.story?.headline}</a>
              <span className="text-xs text-muted-foreground">{a.story?.publisher} · score {a.story?.score}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => ack({ data: { id: a.id } }), "Alert acknowledged")}>Acknowledge</Button>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border">{(["feed", "formd", "ideas", "sources"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 text-xs capitalize ${tab === t ? "bg-primary text-primary-foreground" : ""}`}>{t === "feed" ? "Daily feed" : t === "formd" ? "Form D intelligence" : t}</button>)}</div>
        <select className={sel} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>Last {n} day{n > 1 ? "s" : ""}</option>)}</select>
        <span className="text-[11px] text-muted-foreground">Score = relevance 25% · timeliness 20% · search 20% · engagement 15% · credibility 15% · commercial 5%</span>
      </div>

      {tab === "formd" && <FormDTab tz={d?.timezone} />}
      {tab === "feed" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">{(["all", ...Object.keys(CATEGORIES)] as const).map((c) => <button key={c} onClick={() => setCat(c as any)} className={`rounded-full border px-2 py-0.5 text-xs ${cat === c ? "bg-primary text-primary-foreground" : "border-border"}`}>{c === "all" ? "All" : CATEGORIES[c as Category]} ({(d?.stories ?? []).filter((x: any) => c === "all" || categorize(x) === c).length})</button>)}</div>
          <p className="text-[11px] text-muted-foreground">Routine Form D filings appear here only when they cross the newsworthiness threshold; the rest are in Form D intelligence.</p>
          {!d?.stories.length && <p className="text-sm text-muted-foreground">No stories yet. Press Refresh feeds.</p>}
          {(d?.stories ?? []).filter((x: any) => cat === "all" || categorize(x) === cat).map((s: any, i: number) => (
            <article key={s.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-12 shrink-0 text-center"><div className="font-heading text-xl font-semibold tabular-nums">{Math.round(s.score)}</div><div className="text-[10px] text-muted-foreground">#{i + 1}</div></div>
                <div className="min-w-0 flex-1 space-y-1">
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{s.headline}</a>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{s.publisher}</span>
                    <span className="rounded-sm bg-muted px-1.5 py-0.5">{CATEGORIES[categorize(s)]}</span>
                    {s.published_at && <span>Published {fmtDate(s.published_at, d?.timezone)}</span>}
                    <span>Retrieved {fmtDate(s.retrieved_at, d?.timezone)}</span>
                    {freshnessWarning(s.published_at) && <span className="rounded-sm border border-destructive/50 px-1.5 py-0.5 text-destructive">{freshnessWarning(s.published_at)}</span>}
                    <span className={`rounded-sm px-1.5 py-0.5 ${vTone(s.verification_status)}`}>{VERIFY[s.verification_status]}</span>
                    <span>Confidence {s.confidence}</span>
                    {s.regulatory_sensitivity !== "low" && <span className="rounded-sm border border-destructive/50 px-1.5 py-0.5">Regulatory: {s.regulatory_sensitivity}</span>}
                    {s.suggested_series && <SeriesChip s={byKey[s.suggested_series]} />}
                    {!s.enriched_at && <span className="italic">Not yet analyzed</span>}
                  </div>
                  {s.angle && <p className="text-sm"><span className="text-[11px] font-semibold uppercase text-muted-foreground">Analysis · </span>{s.angle}</p>}
                  {open === s.id && (
                    <div className="space-y-2 pt-1 text-sm">
                      {s.summary && <p className="text-muted-foreground">{s.summary}</p>}
                      {!!s.facts?.length && <div><div className="text-[11px] font-semibold uppercase text-muted-foreground">Facts stated in the source</div><ul className="list-disc pl-5">{s.facts.map((f: string) => <li key={f}>{f}</li>)}</ul></div>}
                      {!!s.numbers?.length && <div><div className="text-[11px] font-semibold uppercase text-muted-foreground">Numbers</div><ul className="list-disc pl-5">{s.numbers.map((n: any) => <li key={n.value + n.context}><b>{n.value}</b> — {n.context}</li>)}</ul></div>}
                      {s.audience && <p><b>Audience:</b> {s.audience}</p>}
                      {!!s.keywords?.length && <p><b>Keywords:</b> {s.keywords.join(", ")}</p>}
                      {!!s.primary_source_urls?.length && <p><b>Primary source:</b> {s.primary_source_urls.map((u: string) => <a key={u} className="underline" href={u} target="_blank" rel="noreferrer">{u}</a>)}</p>}
                      <div className="grid grid-cols-3 gap-1 text-[11px] sm:grid-cols-6">{(Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]).map((k) => <div key={k} className="rounded bg-muted p-1"><div className="capitalize text-muted-foreground">{k === "seo" ? "search" : k}</div><div className="font-semibold tabular-nums">{s[k]}</div></div>)}</div>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Less" : "Details"}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => dismiss({ data: { id: s.id } }), "Dismissed")}>Dismiss</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "ideas" && (
        <div className="space-y-6">
          {series.map((s) => {
            const ideas = (d?.ideas ?? []).filter((i: any) => i.series_key === s.key);
            return (
              <section key={s.key} className="space-y-2">
                <h2 className="font-heading text-lg" style={{ color: s.color }}>{s.name} <span className="text-xs text-muted-foreground">· {s.intention}</span></h2>
                {s.guardrail && <p className="text-xs text-muted-foreground">{s.guardrail}</p>}
                {!ideas.length && <p className="text-sm text-muted-foreground">No ideas yet. Press Suggest ideas.</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  {ideas.map((i: any) => (
                    <article key={i.id} className="space-y-2 rounded-lg border-l-4 border-border bg-card p-3" style={{ borderLeftColor: s.color }}>
                      <h3 className="font-medium">{i.title}</h3>
                      {i.social_headline && <p className="text-sm text-muted-foreground">{i.social_headline}</p>}
                      <p className="text-sm"><span className="text-[11px] font-semibold uppercase text-muted-foreground">Angle · </span>{i.angle}</p>
                      <ul className="space-y-1 text-xs">
                        {(i.claims ?? []).map((c: any, n: number) => (
                          <li key={n} className="flex flex-wrap items-start gap-1">
                            <span className="rounded-sm border border-border px-1 font-semibold">{CLAIM_LABEL[c.kind as ClaimKind]}</span>
                            {c.verification && c.verification !== "not_applicable" && <span className={`rounded-sm px-1 ${vTone(c.verification)}`}>{VERIFY[c.verification]}</span>}
                            <span className="flex-1">{c.text}</span>
                            {c.source_url && <a className="underline" href={c.source_url} target="_blank" rel="noreferrer">source</a>}
                          </li>
                        ))}
                      </ul>
                      {i.unverified_claims > 0 && <p className="text-xs text-destructive">{i.unverified_claims} unverified claim(s) — this can't be approved until each has a primary source.</p>}
                      {i.converted_item_id
                        ? <p className="text-xs text-muted-foreground">On the calendar <Link to="/marketing/studio/calendar" className="underline">open calendar</Link></p>
                        : <ConvertButton busy={busy} onConvert={(at) => act(() => convert({ data: { id: i.id, publish_at: at } }), "Added to the calendar")} weekday={s.weekday} />}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "sources" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="p-2">Source</th><th className="p-2">Type</th><th className="p-2">Credibility</th><th className="p-2">Status</th><th className="p-2">Last fetched</th></tr></thead>
              <tbody>{(d?.sources ?? []).map((s: any) => (
                <tr key={s.key} className="border-t border-border">
                  <td className="p-2">{s.name}{s.is_primary && <span className="ml-1 text-[10px] text-primary">primary</span>}</td>
                  <td className="p-2 text-xs">{s.kind}</td><td className="p-2 tabular-nums">{s.credibility}</td>
                  <td className="p-2 text-xs">{s.active ? (s.last_error ? <span className="text-destructive">{s.last_error}</span> : "Automatic") : s.access_note}</td>
                  <td className="p-2 text-xs">{s.last_fetched_at ? fmtInTz(s.last_fetched_at, tz) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ManualStory sources={(d?.sources ?? []) as any[]} busy={busy} onAdd={(v) => act(() => add({ data: v }), "Story added")} />
          <div className="text-xs text-muted-foreground">Recent runs: {(d?.runs ?? []).map((r: any) => `${fmtInTz(r.started_at, tz)} ${r.status}`).join(" · ") || "none yet"}</div>
        </div>
      )}
    </MkPage>
  );
}

function ConvertButton({ busy, onConvert, weekday }: { busy: boolean; onConvert: (at: string | null) => void; weekday: number }) {
  const next = () => { const d = new Date(); d.setHours(9, 0, 0, 0); const diff = (weekday - (((d.getDay() + 6) % 7) + 1) + 7) % 7 || 7; d.setDate(d.getDate() + diff); return d; };
  const [at, setAt] = useState(() => { const d = next(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="datetime-local" className="rounded-md border border-input bg-background px-2 py-1 text-xs" value={at} onChange={(e) => setAt(e.target.value)} />
      <Button size="sm" disabled={busy} onClick={() => onConvert(at ? new Date(at).toISOString() : null)}>Add to calendar</Button>
    </div>
  );
}

function ManualStory({ sources, busy, onAdd }: { sources: any[]; busy: boolean; onAdd: (v: any) => void }) {
  const [v, setV] = useState({ source_key: "reuters", headline: "", url: "", published_at: "", summary: "", primary_source_url: "" });
  const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <h2 className="text-sm font-semibold">Add a story from a licensed or manual source</h2>
      <p className="text-xs text-muted-foreground">Only add stories you can access legitimately. Add the official primary source link (SEC, IRS, company filing) when one exists — without it, facts stay "reported".</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={inp} value={v.source_key} onChange={(e) => setV({ ...v, source_key: e.target.value })}>{sources.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
        <input type="date" className={inp} value={v.published_at} onChange={(e) => setV({ ...v, published_at: e.target.value })} />
        <input className={inp} placeholder="Headline" value={v.headline} onChange={(e) => setV({ ...v, headline: e.target.value })} />
        <input className={inp} placeholder="Article link" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
        <input className={inp} placeholder="Primary source link (optional)" value={v.primary_source_url} onChange={(e) => setV({ ...v, primary_source_url: e.target.value })} />
      </div>
      <textarea className={inp} rows={2} placeholder="Short summary in your own words" value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} />
      <Button size="sm" disabled={busy || !v.headline || !v.url} onClick={() => onAdd({ ...v, published_at: v.published_at ? `${v.published_at}T12:00:00.000Z` : null, primary_source_url: v.primary_source_url || null })}>Add story</Button>
    </section>
  );
}

const fmtDate = (iso: string, tz?: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz || "America/Chicago", month: "short", day: "numeric", year: "numeric" });

function FormDTab({ tz }: { tz?: string }) {
  const [week, setWeek] = useState(""), [q, setQ] = useState("");
  const load = useServerFn(getFormDIntel);
  const r = useQuery({ queryKey: ["formd", week, q], queryFn: () => load({ data: { weekOf: week || null, q } }) });
  const d: any = r.data;
  const Group = ({ title, rows }: { title: string; rows: any[] }) => (
    <div className="rounded-md border border-border p-2"><div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">{title}</div>
      {rows.slice(0, 8).map((g) => <div key={g.key} className="flex justify-between gap-2 text-xs"><span className="truncate">{g.key}</span><span className="tabular-nums">{g.count}</span></div>)}</div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label>Week starting <input type="date" className="rounded-md border border-input bg-background px-2 py-1" value={week} onChange={(e) => setWeek(e.target.value)} /></label>
        {week && <Button size="sm" variant="ghost" onClick={() => setWeek("")}>Last 7 days</Button>}
        <input className="rounded-md border border-input bg-background px-2 py-1" placeholder="Search issuer" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!d ? <p className="text-sm text-muted-foreground">{r.error ? (r.error as Error).message : "Loading…"}</p> : <>
        <section className="rounded-lg border border-border bg-card p-3 space-y-2">
          <h2 className="font-heading text-lg">Weekly Form D Intelligence Digest</h2>
          <p className="text-xs text-muted-foreground">{fmtDate(d.from, tz)} – {fmtDate(d.to, tz)} · computed from the official EDGAR filings below. All amounts are self-reported by issuers on Form D and link to the original filing. Total offering amount is not completed fundraising; amount sold is not independently verified.</p>
          {d.digest.patterns.length ? <ul className="list-disc pl-5 text-sm">{d.digest.patterns.map((p: string) => <li key={p}>{p}</li>)}</ul> : <p className="text-sm text-muted-foreground">No filings in this period.</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Group title="Filing date" rows={d.digest.byDate} /><Group title="Industry" rows={d.digest.byIndustry} /><Group title="Fund / issuer category" rows={d.digest.byCategory} /><Group title="Geography" rows={d.digest.byState} />
            <Group title="Exemption" rows={d.digest.byExemption} /><Group title="Total offering amount" rows={d.digest.bySize} /><Group title="New vs amendment" rows={d.digest.byType} />
          </div>
        </section>
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">Filed</th><th>Issuer</th><th>Type</th><th>Category</th><th>State</th><th>Exemption</th><th title={FORMD_FIELD.total_offering.note}>Total offering amount</th><th title={FORMD_FIELD.total_sold.note}>Total amount sold (reported)</th><th title={FORMD_FIELD.total_remaining.note}>Remaining to be sold</th><th>History</th></tr></thead>
          <tbody>{d.filings.map((f: any) => {
            const hist = d.history.filter((h: any) => h.cik === f.cik && h.accession !== f.accession);
            return <tr key={f.accession} className="border-t border-border align-top">
              <td className="py-1">{f.filed_at ? fmtDate(f.filed_at, tz) : "—"}</td>
              <td><a className="underline" href={f.index_url} target="_blank" rel="noreferrer">{f.issuer}</a>{f.newsworthy && <span className="ml-1 rounded-sm bg-accent/30 px-1">In daily feed</span>}{f.parse_error && <span className="ml-1 text-destructive">details unavailable</span>}</td>
              <td>{f.is_amendment ? `Amendment${f.filed_at ? ` · amended ${fmtDate(f.filed_at, tz)}` : ""}` : "New"}</td><td>{issuerCategory(f)}</td><td>{f.state ?? "—"}</td>
              <td>{f.exemptions.map((e: string) => EXEMPTION_LABEL[e]).filter(Boolean).join(", ") || "—"}</td>
              <td>{fmtFormDAmount(f.total_offering, f.offering_indefinite)}</td>
              <td>{fmtFormDAmount(f.total_sold)}</td>
              <td>{fmtFormDAmount(f.total_remaining == null ? null : Number(f.total_remaining), f.remaining_indefinite)}</td>
              <td>{hist.length ? hist.map((h: any) => `${h.form_type} ${h.filed_at ? fmtDate(h.filed_at, tz) : ""}`).join("; ") : "—"}{f.doc_url && <> · <a className="underline" href={f.doc_url} target="_blank" rel="noreferrer">SEC filing</a></>}</td>
            </tr>;
          })}</tbody></table></div>
      </>}
    </div>
  );
}
