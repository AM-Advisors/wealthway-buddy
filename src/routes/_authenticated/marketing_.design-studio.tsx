import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { LOGO_SRC } from "@/components/marketing/design-canvas";
import { createDesignFn, getBrandKitFn, getDesignHome, saveBrandKitFn } from "@/lib/marketing-design.functions";
import { DESIGN_FORMATS, TEMPLATES, brandKitProblems, type BrandKit, type DesignFormat, type TemplateKey } from "@/lib/marketing-design-model";

export const Route = createFileRoute("/_authenticated/marketing_/design-studio")({
  head: mkHead("Design Studio", "Create editable, Harmonious-branded graphics from articles, verified stories, calendar items or templates."),
  component: DesignStudio,
});

const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
const SOURCES = [
  { key: "item", label: "Content Studio article / calendar item" }, { key: "story", label: "Verified research story" },
  { key: "design", label: "Existing design" }, { key: "template", label: "Template" }, { key: "blank", label: "Blank" },
] as const;

function DesignStudio() {
  const [tab, setTab] = useState<"designs" | "kit">("designs");
  return (
    <MkPage title="Design Studio" intro="Every design stays editable and keeps links to its source article, story and claims. Nothing here publishes."
      actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/marketing/content-studio">Content Studio</Link></Button><Button variant="outline" asChild><Link to="/marketing/studio">Back to Studio</Link></Button></div>}>
      <div className="flex gap-1 border-b border-border">{(["designs", "kit"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{t === "designs" ? "Designs" : "Brand Kit"}</button>)}</div>
      {tab === "designs" ? <Designs /> : <BrandKitPanel />}
    </MkPage>
  );
}

function Designs() {
  const load = useServerFn(getDesignHome), create = useServerFn(createDesignFn);
  const q = useQuery({ queryKey: ["design-home"], queryFn: () => load() });
  const nav = useNavigate();
  const [kind, setKind] = useState<(typeof SOURCES)[number]["key"]>("item");
  const [src, setSrc] = useState<string>("");
  const [tpl, setTpl] = useState<TemplateKey>("market_headline");
  const [format, setFormat] = useState<DesignFormat>("li_square");
  const [busy, setBusy] = useState(false);
  const d: any = q.data;
  const list: any[] = !d ? [] : kind === "item" ? d.items : kind === "story" ? d.stories : kind === "design" ? d.designs : [];
  const go = async () => {
    setBusy(true);
    try { const r = await create({ data: { kind, template: kind === "blank" ? "blank" : tpl, format, source_id: src || null } }); nav({ to: "/marketing/design-studio/$designId", params: { designId: r.id } }); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const needsSrc = kind === "item" || kind === "story" || kind === "design";
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-lg">New design</h2>
        <label className="block text-sm">Start from<select className={inp} value={kind} onChange={(e) => { setKind(e.target.value as any); setSrc(""); }}>{SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        {needsSrc && <label className="block text-sm">Source<select className={inp} value={src} onChange={(e) => setSrc(e.target.value)}>
          <option value="">Choose…</option>
          {list.map((x: any) => <option key={x.id} value={x.id}>{x.article_title || x.headline || x.title || x.topic || "Untitled"}</option>)}</select>
          {!q.isLoading && !list.length && <span className="text-xs text-muted-foreground">Nothing available yet.</span>}</label>}
        {kind !== "blank" && kind !== "design" && <label className="block text-sm">Template<select className={inp} value={tpl} onChange={(e) => setTpl(e.target.value as TemplateKey)}>{TEMPLATES.filter((t) => t.key !== "blank").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>}
        {kind !== "design" && <label className="block text-sm">Format<select className={inp} value={format} onChange={(e) => setFormat(e.target.value as DesignFormat)}>{Object.entries(DESIGN_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label} — {f.w} × {f.h}</option>)}</select></label>}
        <Button disabled={busy || (needsSrc && !src)} onClick={go}>{busy ? "Creating…" : "Create and open editor"}</Button>
        <p className="text-xs text-muted-foreground">Headlines and claims are copied only from the stored article or verified story. Figures are left for you to fill from a source.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg">Designs</h2>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !d?.designs.length ? <p className="text-sm text-muted-foreground">No designs yet.</p> :
          <div className="divide-y divide-border rounded-lg border border-border">{d.designs.map((x: any) => (
            <Link key={x.id} to="/marketing/design-studio/$designId" params={{ designId: x.id }} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted">
              <span className="truncate">{x.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{DESIGN_FORMATS[x.format as DesignFormat]?.label} · v{x.version} · {x.status}</span>
            </Link>))}</div>}
      </section>
    </div>
  );
}

function BrandKitPanel() {
  const load = useServerFn(getBrandKitFn), save = useServerFn(saveBrandKitFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["brand-kit"], queryFn: () => load() });
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => { if (q.data) setKit(structuredClone(q.data.kit)); }, [q.data]);
  if (!q.data || !kit) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const can = q.data.canEdit, problems = brandKitProblems(kit);
  const set = (f: (k: BrandKit) => void) => setKit((k) => { const n = structuredClone(k!); f(n); return n; });
  const submit = async () => { try { const r = await save({ data: { kit, note: note || null } }); toast.success(`Brand Kit version ${r.version} saved.`); setNote(""); qc.invalidateQueries({ queryKey: ["brand-kit"] }); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Version {q.data.version || "default (from existing brand assets)"}. {can ? "You can edit the Brand Kit; every save is kept as a new version." : "View only — marketing managers and administrators can edit."}</p>
      <section><h3 className="mb-2 font-semibold">Approved logos</h3><div className="flex flex-wrap gap-3">{kit.logos.map((l) => (
        <div key={l.key} className="w-40 rounded-md border border-border p-2 text-center text-xs"><div className={`flex h-16 items-center justify-center rounded ${l.variant === "white" ? "bg-primary" : "bg-muted"}`}><img src={LOGO_SRC[`logo:${l.key}`]} alt={l.label} className="max-h-12 max-w-full object-contain" /></div>{l.label}</div>))}</div>
        <p className="mt-1 text-xs text-muted-foreground">Logos are the official files only and can't be replaced here.</p></section>
      <section><h3 className="mb-2 font-semibold">Brand colors</h3><div className="grid gap-2 sm:grid-cols-3">{kit.colors.map((c, i) => (
        <label key={c.key} className="flex items-center gap-2 text-sm"><span className="h-8 w-8 rounded border border-border" style={{ background: c.hex }} />{c.label}
          <input disabled={!can} className={`${inp} w-28`} value={c.hex} onChange={(e) => set((k) => { k.colors[i]!.hex = e.target.value; })} /></label>))}</div></section>
      <section className="grid gap-3 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Typography</h3>
        <label className="text-sm">Headings<input disabled={!can} className={inp} value={kit.typography.heading} onChange={(e) => set((k) => { k.typography.heading = e.target.value; })} /></label>
        <label className="text-sm">Body<input disabled={!can} className={inp} value={kit.typography.body} onChange={(e) => set((k) => { k.typography.body = e.target.value; })} /></label></section>
      <section><h3 className="mb-2 font-semibold">Series styles</h3><div className="grid gap-2 md:grid-cols-2">{Object.entries(kit.styles).map(([key, s]) => (
        <div key={key} className="rounded-md border border-border p-3 text-sm"><div className="font-semibold">{s.label}</div><p className="text-xs text-muted-foreground">{s.note}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">{(["background", "accent", "text"] as const).map((f) => <label key={f} className="text-xs capitalize">{f}
            <select disabled={!can} className={inp} value={s[f]} onChange={(e) => set((k) => { k.styles[key]![f] = e.target.value; })}>{kit.colors.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>)}</div></div>))}</div></section>
      <section className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Standard disclaimer<textarea disabled={!can} className={inp} rows={2} value={kit.disclaimers[0]?.text ?? ""} onChange={(e) => set((k) => { k.disclaimers[0] = { key: "educational", text: e.target.value }; })} /></label>
        <label className="text-sm">Source attribution format<input disabled={!can} className={inp} value={kit.attribution.format} onChange={(e) => set((k) => { k.attribution.format = e.target.value; })} /></label>
        {kit.websites.map((w, i) => <label key={i} className="text-sm">{w.label}<input disabled={!can} className={inp} value={w.url} onChange={(e) => set((k) => { k.websites[i]!.url = e.target.value; })} /></label>)}
        {kit.socials.map((s, i) => <label key={i} className="text-sm">{s.network} handle<input disabled={!can} className={inp} value={s.handle} onChange={(e) => set((k) => { k.socials[i]!.handle = e.target.value; })} /></label>)}
      </section>
      {can && <div className="space-y-2">
        {problems.map((p) => <p key={p} className="text-sm text-destructive">{p}</p>)}
        <input className={inp} placeholder="What changed (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button disabled={!!problems.length} onClick={submit}>Save new Brand Kit version</Button></div>}
    </div>
  );
}
