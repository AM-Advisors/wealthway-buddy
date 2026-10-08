import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { getContentStudioSources, startContentPackage } from "@/lib/marketing-content.functions";
import { SERIES_TEMPLATES } from "@/lib/marketing-content-model";
import { useOrgTz } from "@/components/marketing/use-org-tz";
import { fmtInTz } from "@/lib/org-timezone";

export const Route = createFileRoute("/_authenticated/marketing_/content-studio")({
  head: mkHead("Content Studio", "Start a source-backed Harmonious content package from research, an idea, a calendar item or an approved topic."),
  component: ContentStudio,
});

const MODES = [
  { key: "stories", label: "Verified stories" }, { key: "idea", label: "Research ideas" },
  { key: "item", label: "Calendar items" }, { key: "manual", label: "Approved topic" },
] as const;
const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";

function ContentStudio() {
  const tz = useOrgTz();
  const load = useServerFn(getContentStudioSources), start = useServerFn(startContentPackage);
  const q = useQuery({ queryKey: ["content-studio"], queryFn: () => load() });
  const nav = useNavigate();
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("stories");
  const [picked, setPicked] = useState<string[]>([]);
  const [series, setSeries] = useState("market_monday");
  const [guidance, setGuidance] = useState("");
  const [manual, setManual] = useState({ title: "", topic: "", urls: "" });
  const [busy, setBusy] = useState(false);
  const d: any = q.data;
  const toggle = (id: string, multi: boolean) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : multi ? [...p, id].slice(0, 8) : [id]));

  const go = async () => {
    const g = guidance.trim() || null;
    let input: any;
    if (mode === "stories") input = { kind: "stories", story_ids: picked, series_key: series, guidance: g };
    else if (mode === "idea") input = { kind: "idea", idea_id: picked[0], guidance: g };
    else if (mode === "item") input = { kind: "item", item_id: picked[0], guidance: g };
    else input = { kind: "manual", series_key: series, title: manual.title, topic: manual.topic, source_urls: manual.urls.split(/\s+/).filter(Boolean), guidance: g };
    setBusy(true);
    try {
      const r = await start({ data: input });
      toast.success(r.existing ? "An open item already uses these stories — opening it instead of duplicating." : `Draft package v${r.version} created. It stays a draft until reviewed.`);
      nav({ to: "/marketing/studio/content/$itemId", params: { itemId: r.itemId } });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const ready = mode === "manual" ? manual.title.trim().length > 2 && manual.urls.trim() : picked.length > 0;

  return (
    <MkPage title="Content Studio" intro="Generate a complete, editable draft package from verified research. Drafts never approve or publish themselves."
      actions={<Button variant="outline" asChild><Link to="/marketing/studio">Back to Studio</Link></Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1 border-b border-border">{MODES.map((m) => <button key={m.key} onClick={() => { setMode(m.key); setPicked([]); }} className={`px-3 py-2 text-sm ${mode === m.key ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{m.label}</button>)}</div>
        {!d ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
          {mode === "stories" && <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Only stories verified against a primary source in the last 30 days. Pick several to build one package from a group of related stories.</p>
            {(d.stories as any[]).map((s) => <label key={s.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id, true)} />
              <span><b>{s.headline}</b><span className="block text-xs text-muted-foreground">{s.publisher} · {s.published_at ? fmtInTz(s.published_at, tz) : "date unknown"} · score {s.score ?? "—"}</span></span>
            </label>)}
            {!d.stories.length && <p className="text-sm">No verified stories yet.</p>}
          </div>}
          {mode === "idea" && <div className="space-y-1">{(d.ideas as any[]).map((i) => <label key={i.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
            <input type="radio" checked={picked[0] === i.id} onChange={() => toggle(i.id, false)} />
            <span><b>{i.title}</b><span className="block text-xs text-muted-foreground">{i.series_key} · {i.idea_date}{i.unverified_claims ? ` · ${i.unverified_claims} unverified fact(s)` : ""}</span></span></label>)}
            {!d.ideas.length && <p className="text-sm">No unused ideas.</p>}</div>}
          {mode === "item" && <div className="space-y-1">{(d.items as any[]).map((i) => <label key={i.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
            <input type="radio" checked={picked[0] === i.id} onChange={() => toggle(i.id, false)} />
            <span><b>{i.article_title || i.topic || "Untitled"}</b><span className="block text-xs text-muted-foreground">{i.series_key} · {i.status}{i.publish_at ? ` · ${fmtInTz(i.publish_at, tz)}` : ""}{i.package_version ? ` · has package v${i.package_version} (a new version will be added)` : ""}</span></span></label>)}
            {!d.items.length && <p className="text-sm">No editable calendar items.</p>}</div>}
          {mode === "manual" && (d.canManualTopic ? <div className="grid gap-2">
            <label className="text-xs">Title<input className={inp} value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} /></label>
            <label className="text-xs">Topic and angle<input className={inp} value={manual.topic} onChange={(e) => setManual({ ...manual, topic: e.target.value })} /></label>
            <label className="text-xs">Primary source links (one per line, required)<textarea className={inp} rows={3} value={manual.urls} onChange={(e) => setManual({ ...manual, urls: e.target.value })} /></label>
            <p className="text-[11px] text-muted-foreground">Starting a manual topic records your approval of it. Facts from these links stay unverified until a reviewer checks them.</p>
          </div> : <p className="text-sm">Only a marketing manager can approve a manual topic.</p>)}

          <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-2">
            {(mode === "stories" || mode === "manual") && <label className="text-xs">Series template<select className={inp} value={series} onChange={(e) => setSeries(e.target.value)}>{(d.series as any[]).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
              <span className="mt-1 block text-[11px] text-muted-foreground">{SERIES_TEMPLATES[series]?.summary}</span></label>}
            <label className="text-xs">Guidance for the draft (optional)<input className={inp} value={guidance} onChange={(e) => setGuidance(e.target.value)} /></label>
            <div className="md:col-span-2 flex items-center gap-3"><Button disabled={busy || !ready} onClick={go}>{busy ? "Drafting…" : "Generate draft package"}</Button>
              <span className="text-[11px] text-muted-foreground">Includes article, SEO, FAQs, structured data, captions, newsletter, graphic concepts, CTAs and labelled claims.</span></div>
          </div>
        </>}
      </div>
    </MkPage>
  );
}
