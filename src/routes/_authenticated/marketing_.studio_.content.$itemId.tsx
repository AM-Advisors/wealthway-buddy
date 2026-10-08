import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { StatusPill } from "@/components/marketing/studio";
import {
  checkOriginality, contentToArticle, contentToPosts, generateContentPackage, getContentWorkspace, recordContentReview, saveContentPackage,
} from "@/lib/marketing-content.functions";
import { GRAPHIC_SIZES, GRAPHIC_TEMPLATES, REVIEW_KINDS, REVIEW_LABEL, SOCIAL_CHANNELS, approvalGaps, type ContentPackage, type ReviewKind } from "@/lib/marketing-content-model";
import { RESOURCE_CATEGORIES } from "@/lib/marketing/site-config";

export const Route = createFileRoute("/_authenticated/marketing_/studio_/content/$itemId")({
  head: mkHead("Content workspace", "Build and review a source-backed article, SEO, social and design package for a Studio item."),
  component: Workspace,
});

const TABS = ["Article", "SEO & GEO", "Social", "Design", "Reviews", "History"] as const;
const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";

function Workspace() {
  const { itemId } = Route.useParams();
  const load = useServerFn(getContentWorkspace), gen = useServerFn(generateContentPackage), save = useServerFn(saveContentPackage);
  const rev = useServerFn(recordContentReview), orig = useServerFn(checkOriginality), toArt = useServerFn(contentToArticle), toPosts = useServerFn(contentToPosts);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["content-ws", itemId], queryFn: () => load({ data: { id: itemId } }) });
  const [tab, setTab] = useState<(typeof TABS)[number]>("Article");
  const [p, setP] = useState<ContentPackage | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guidance, setGuidance] = useState("");
  const d: any = q.data;
  const latest = d?.packages?.[0];
  useEffect(() => { if (latest && !dirty) setP(latest.package); }, [latest?.id]);
  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true); try { const r = await fn(); toast.success(ok); setDirty(false); await qc.invalidateQueries({ queryKey: ["content-ws", itemId] }); return r; }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const set = (patch: Partial<ContentPackage>) => { setP((x) => (x ? { ...x, ...patch } : x)); setDirty(true); };
  if (!d) return <MkPage title="Content workspace" intro="Loading…"><div /></MkPage>;
  const item = d.item;
  const locked = ["approved", "scheduled", "published", "performance_review"].includes(item.status);
  const gaps = approvalGaps(item.series_key, item.package_version ?? 0, d.reviews);

  return (
    <MkPage title={item.article_title || "Content workspace"} intro={`${d.series?.name ?? item.series_key} · package v${item.package_version || 0}`}
      actions={<div className="flex flex-wrap items-center gap-2"><StatusPill s={item.status} /><Button variant="outline" asChild><Link to="/marketing/studio">Back to Studio</Link></Button></div>}>
      <div className="space-y-4">
        {latest?.ai_generated && <p className="rounded-md bg-muted px-3 py-2 text-xs">Internal note: version {latest.version} is an AI draft{latest.model ? ` (${latest.model})` : ""}. Every fact must pass review before approval.</p>}
        {item.series_key === "founders_friday" && <p className="rounded-md border border-border px-3 py-2 text-xs">Founders Friday: the AI never writes Alyssa's experiences or opinions. Alyssa must record her own review before this can be approved.</p>}
        {locked && <p className="rounded-md bg-muted px-3 py-2 text-xs">Approved content is locked. Send the item back in the Studio to edit.</p>}

        {!locked && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
            <label className="min-w-64 flex-1 text-xs">Guidance for the AI draft (optional)<input className={inp} value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="e.g. focus on what emerging managers should do this quarter" /></label>
            <Button disabled={busy} onClick={() => act(() => gen({ data: { id: itemId, guidance: guidance || null } }), "New package version drafted").then(() => setDirty(false))}>{latest ? "Regenerate package" : "Generate package"}</Button>
            {p && <Button variant="outline" disabled={busy || !dirty} onClick={() => act(() => save({ data: { id: itemId, package: p, note: null } }), "Saved as a new version")}>Save edits as new version</Button>}
          </div>
        )}

        {!p ? <p className="text-sm text-muted-foreground">No package yet. Add sources to the item, then generate.</p> : <>
          {p.checks && (p.checks.dropped_citations.length + p.checks.dropped_links.length + p.checks.unverified_stats + p.checks.ranking_claims.length > 0) && (
            <div className="rounded-md border border-destructive px-3 py-2 text-xs text-destructive">
              {p.checks.dropped_citations.length > 0 && <div>Removed {p.checks.dropped_citations.length} citation(s) not in this item's sources.</div>}
              {p.checks.dropped_links.length > 0 && <div>Removed {p.checks.dropped_links.length} internal link(s) to pages that don't exist.</div>}
              {p.checks.unverified_stats > 0 && <div>Cleared {p.checks.unverified_stats} graphic statistic(s) not found in the verified sources.</div>}
              {p.checks.ranking_claims.length > 0 && <div>Remove ranking promises: {p.checks.ranking_claims.join(", ")}</div>}
            </div>
          )}
          <div className="flex flex-wrap gap-1 border-b border-border">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{t}</button>)}</div>
          <fieldset disabled={locked} className="space-y-3">
            {tab === "Article" && <ArticleTab p={p} set={set} />}
            {tab === "SEO & GEO" && <SeoTab p={p} set={set} />}
            {tab === "Social" && <SocialTab p={p} set={set} />}
            {tab === "Design" && <DesignTab p={p} set={set} sources={d.sources} />}
          </fieldset>
          {tab === "Reviews" && <ReviewsTab d={d} gaps={gaps} busy={busy}
            onReview={(kind: ReviewKind, result: "pass" | "fail", note: string) => act(() => rev({ data: { id: itemId, kind, result, note } }), "Review recorded")}
            onOriginality={async () => { try { const r = await orig({ data: { id: itemId } }); toast.message(`${r.overlap}% of 8-word phrases match the source text${r.overlap > 15 ? " — rewrite in original words" : ""}.`); } catch (e: any) { toast.error(e.message); } }} />}
          {tab === "History" && <HistoryTab d={d} />}

          <div className="space-y-2 rounded-md border border-border p-3">
            <h3 className="text-sm font-semibold">Hand off to channels (drafts only)</h3>
            <p className="text-xs text-muted-foreground">Creates drafts in the existing Classroom and Social posts. They can't be approved or published until this Studio item is approved.</p>
            <div className="flex flex-wrap gap-2">
              {d.article ? <span className="text-xs">Classroom article: /post/{d.article.slug} ({d.article.status})</span> : <ArticleHandoff busy={busy || dirty} onGo={(c) => act(() => toArt({ data: { id: itemId, category: c } }), "Classroom draft created")} />}
              {d.posts.length ? <span className="text-xs">{d.posts.length} social drafts: {d.posts.map((x: any) => `${x.channels.join("/")} (${x.status})`).join(", ")}</span>
                : <Button size="sm" variant="outline" disabled={busy || dirty} onClick={() => act(() => toPosts({ data: { id: itemId } }), "Facebook and Instagram drafts created")}>Create Facebook + Instagram drafts</Button>}
            </div>
            <p className="text-[11px] text-muted-foreground">LinkedIn, X and the email newsletter text are ready to copy; LinkedIn company posting stays unavailable until the page credential is approved.</p>
          </div>
        </>}
      </div>
    </MkPage>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-xs font-medium">{label}{children}</label>; }
type TP = { p: ContentPackage; set: (x: Partial<ContentPackage>) => void };

function ArticleTab({ p, set }: TP) {
  return <div className="grid gap-3">
    <F label="SEO article title"><input className={inp} value={p.seo_title} onChange={(e) => set({ seo_title: e.target.value })} /></F>
    <F label="Social headline"><input className={inp} value={p.social_headline} onChange={(e) => set({ social_headline: e.target.value })} /></F>
    <F label="Outline (one heading per line; points after ' - ')"><textarea className={inp} rows={6} value={p.outline.map((o) => [o.heading, ...o.points.map((x) => ` - ${x}`)].join("\n")).join("\n")}
      onChange={(e) => { const out: ContentPackage["outline"] = []; for (const l of e.target.value.split("\n")) { if (l.startsWith(" - ")) out.at(-1)?.points.push(l.slice(3)); else if (l.trim()) out.push({ heading: l, points: [] }); } set({ outline: out }); }} /></F>
    <F label="Article (HTML)"><textarea className={`${inp} font-mono text-xs`} rows={18} value={p.body_html} onChange={(e) => set({ body_html: e.target.value })} /></F>
    <div className="rounded-md border border-border p-3"><p className="mb-2 text-xs font-semibold">Preview</p><div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: p.body_html.replace(/<script[\s\S]*?<\/script>/gi, "") }} /></div>
    <F label="FAQ (Q: / A: lines)"><textarea className={inp} rows={6} value={p.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n")}
      onChange={(e) => { const out: ContentPackage["faq"] = []; for (const l of e.target.value.split("\n")) { if (l.startsWith("Q: ")) out.push({ q: l.slice(3), a: "" }); else if (l.startsWith("A: ") && out.length) out.at(-1)!.a = l.slice(3); } set({ faq: out }); }} /></F>
    <F label="Primary-source citations (label | url per line; must be one of the item's sources)"><textarea className={inp} rows={4} value={p.citations.map((c) => `${c.label} | ${c.url}`).join("\n")}
      onChange={(e) => set({ citations: e.target.value.split("\n").filter(Boolean).map((l) => { const [a, b] = l.split(" | "); return { label: a ?? "", url: (b ?? "").trim() }; }) })} /></F>
    <F label="Call to action"><input className={inp} value={p.cta} onChange={(e) => set({ cta: e.target.value })} /></F>
  </div>;
}

function SeoTab({ p, set }: TP) {
  return <div className="grid gap-3 md:grid-cols-2">
    <F label="URL slug"><input className={inp} value={p.slug} onChange={(e) => set({ slug: e.target.value })} /><span className="text-[11px] text-muted-foreground">Canonical: https://harmonious.co/post/{p.slug}</span></F>
    <F label="Primary keyword"><input className={inp} value={p.primary_keyword} onChange={(e) => set({ primary_keyword: e.target.value })} /></F>
    <F label={`Meta title (${p.meta_title.length}/60)`}><input className={inp} value={p.meta_title} onChange={(e) => set({ meta_title: e.target.value })} /></F>
    <F label="Search intent"><input className={inp} value={p.search_intent} onChange={(e) => set({ search_intent: e.target.value })} /></F>
    <div className="md:col-span-2"><F label={`Meta description (${p.meta_description.length}/155)`}><textarea className={inp} rows={2} value={p.meta_description} onChange={(e) => set({ meta_description: e.target.value })} /></F></div>
    <div className="md:col-span-2"><F label="Secondary keywords (comma separated)"><input className={inp} value={p.secondary_keywords.join(", ")} onChange={(e) => set({ secondary_keywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></F></div>
    <div className="md:col-span-2"><F label="Internal links (label | url; only existing Harmonious pages are kept)"><textarea className={inp} rows={4} value={p.internal_links.map((c) => `${c.label} | ${c.url}`).join("\n")}
      onChange={(e) => set({ internal_links: e.target.value.split("\n").filter(Boolean).map((l) => { const [a, b] = l.split(" | "); return { label: a ?? "", url: (b ?? "").trim() }; }) })} /></F></div>
    <div className="md:col-span-2"><F label="Structured data (built automatically from the visible title, description, author, dates and FAQ — rebuilt on save)"><pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px]">{p.schema_jsonld}</pre></F></div>
    <p className="text-[11px] text-muted-foreground md:col-span-2">Optimizes for search and AI answers with question headings, direct answers, definitions, FAQ and citations. No ranking or AI-citation outcome is guaranteed.</p>
  </div>;
}

function SocialTab({ p, set }: TP) {
  const limits: Record<string, number> = { x: 280, instagram: 2200 };
  return <div className="grid gap-3 md:grid-cols-2">
    {SOCIAL_CHANNELS.filter((c) => c.key !== "email").map((c) => { const k = c.key as keyof ContentPackage["social"]; return (
      <F key={c.key} label={`${c.label} (${p.social[k].length}${limits[c.key] ? `/${limits[c.key]}` : ""})`}><textarea className={inp} rows={7} value={p.social[k]} onChange={(e) => set({ social: { ...p.social, [k]: e.target.value } })} /></F>); })}
    <F label="Email newsletter subject"><input className={inp} value={p.social.email_subject} onChange={(e) => set({ social: { ...p.social, email_subject: e.target.value } })} /></F>
    <F label="Email newsletter blurb"><textarea className={inp} rows={5} value={p.social.email_body} onChange={(e) => set({ social: { ...p.social, email_body: e.target.value } })} /></F>
  </div>;
}

function DesignTab({ p, set, sources }: TP & { sources: string[] }) {
  const upd = (i: number, patch: any) => set({ graphics: p.graphics.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Branded graphic plans. Statistics must come from a verified source on this item. Open the social post draft's branded designer to render them with the official logo and fonts.</p>
    {p.graphics.map((g, i) => (
      <div key={i} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-2">
        <F label="Template"><select className={inp} value={g.template} onChange={(e) => upd(i, { template: e.target.value })}>{GRAPHIC_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></F>
        <F label="Size"><select className={inp} value={g.size} onChange={(e) => upd(i, { size: e.target.value })}>{GRAPHIC_SIZES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></F>
        <F label="Headline"><input className={inp} value={g.headline} onChange={(e) => upd(i, { headline: e.target.value })} /></F>
        <F label="Subhead"><input className={inp} value={g.subhead} onChange={(e) => upd(i, { subhead: e.target.value })} /></F>
        <F label="Statistic (verbatim from a source)"><input className={inp} value={g.stat} onChange={(e) => upd(i, { stat: e.target.value })} />{g.stat_unverified && <span className="text-[11px] text-destructive">Previous statistic wasn't in the verified sources and was cleared.</span>}</F>
        <F label="Statistic source"><select className={inp} value={g.stat_source_url} onChange={(e) => upd(i, { stat_source_url: e.target.value })}><option value="">—</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
        <div className="md:col-span-2"><F label="Bullets / slides (one per line)"><textarea className={inp} rows={3} value={g.bullets.join("\n")} onChange={(e) => upd(i, { bullets: e.target.value.split("\n") })} /></F></div>
        <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => set({ graphics: p.graphics.filter((_, j) => j !== i) })}>Remove</Button>
      </div>
    ))}
    <Button size="sm" variant="outline" onClick={() => set({ graphics: [...p.graphics, { template: "academy", size: "portrait", headline: "", subhead: "", stat: "", stat_source_url: "", bullets: [] }] })}>Add graphic</Button>
  </div>;
}

function ReviewsTab({ d, gaps, busy, onReview, onOriginality }: any) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const kinds = REVIEW_KINDS.filter((k) => k !== "founder_review" || d.item.series_key === "founders_friday");
  const v = d.item.package_version;
  return <div className="space-y-3">
    <div className={`rounded-md px-3 py-2 text-xs ${gaps.length ? "border border-destructive text-destructive" : "bg-muted"}`}>
      {gaps.length ? <>Approval blocked:<ul className="list-disc pl-4">{gaps.map((g: string) => <li key={g}>{g}</li>)}</ul></> : `All reviews passed for version ${v}. An executive can now approve it in the Studio.`}
      <div className="mt-1 text-muted-foreground">Any edit creates a new version and needs fresh reviews. Unapproved content can't be scheduled or published.</div>
    </div>
    {kinds.map((k) => {
      const last = d.reviews.find((r: any) => r.kind === k && r.package_version === v);
      return <div key={k} className="space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="text-sm">{REVIEW_LABEL[k as ReviewKind]}</b>
          {last ? <span className="text-xs">{last.result === "pass" ? "Passed" : "Failed"} by {d.people[last.actor_id] ?? "reviewer"} · {new Date(last.created_at).toLocaleString()}</span> : <span className="text-xs text-muted-foreground">Not reviewed for v{v}</span>}
        </div>
        {k === "originality" && <Button size="sm" variant="outline" onClick={onOriginality}>Check overlap with sources</Button>}
        <input className={inp} placeholder="Note (required for a fail or a Super Admin self-review)" value={notes[k] ?? ""} onChange={(e) => setNotes({ ...notes, [k]: e.target.value })} />
        <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => onReview(k, "pass", notes[k] ?? "")}>Pass</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onReview(k, "fail", notes[k] ?? "")}>Fail</Button></div>
      </div>;
    })}
  </div>;
}

function HistoryTab({ d }: any) {
  return <div className="space-y-1 text-xs">
    <b className="text-sm">Package versions</b>
    {d.packages.map((x: any) => <div key={x.id}>v{x.version} · {x.ai_generated ? "AI draft" : "Edited"} by {d.people[x.created_by] ?? "team member"} · {new Date(x.created_at).toLocaleString()}{x.note ? ` · ${x.note}` : ""}</div>)}
    <b className="mt-3 block text-sm">Reviews</b>
    {d.reviews.map((r: any) => <div key={r.id}>v{r.package_version} · {REVIEW_LABEL[r.kind as ReviewKind]} · {r.result} · {d.people[r.actor_id] ?? "reviewer"} · {new Date(r.created_at).toLocaleString()}{r.note ? ` · ${r.note}` : ""}</div>)}
  </div>;
}

function ArticleHandoff({ busy, onGo }: { busy: boolean; onGo: (c: string) => void }) {
  const [c, setC] = useState<string>(RESOURCE_CATEGORIES[0]!.slug);
  return <div className="flex gap-2"><select className="rounded-md border border-input bg-background px-2 text-xs" value={c} onChange={(e) => setC(e.target.value)}>{RESOURCE_CATEGORIES.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}</select>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => onGo(c)}>Create Classroom draft</Button></div>;
}
