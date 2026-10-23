import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Redo2, Trash2, Undo2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { DesignCanvas } from "@/components/marketing/design-canvas";
import { getDesignFn, restoreDesignVersionFn, saveDesignFn } from "@/lib/marketing-design.functions";
import {
  DESIGN_FORMATS, ICONS, TEMPLATES, chartProblems, colorHex, designProblems, resizeDesign, safeMargin, switchTemplate, uid,
  type BrandKit, type DesignDoc, type DesignFormat, type Layer, type TemplateKey,
} from "@/lib/marketing-design-model";

export const Route = createFileRoute("/_authenticated/marketing_/design-studio_/$designId")({
  head: mkHead("Design editor", "Edit a Harmonious design: layers, text, images, shapes, icons, charts and pages."),
  component: Editor,
});

const inp = "w-full rounded-md border border-input bg-background px-2 py-1 text-sm";

function Editor() {
  const { designId } = Route.useParams();
  const load = useServerFn(getDesignFn), save = useServerFn(saveDesignFn), restore = useServerFn(restoreDesignVersionFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["design", designId], queryFn: () => load({ data: { id: designId } }) });
  const [doc, setDoc] = useState<DesignDoc | null>(null);
  const [title, setTitle] = useState("");
  const [past, setPast] = useState<DesignDoc[]>([]), [future, setFuture] = useState<DesignDoc[]>([]);
  const [pi, setPi] = useState(0), [sel, setSel] = useState<string | null>(null);
  const [grid, setGrid] = useState(true), [preview, setPreview] = useState(false), [saving, setSaving] = useState(false);
  const [base, setBase] = useState(0);
  useEffect(() => { if (q.data) { setDoc(q.data.design.doc); setTitle(q.data.design.title); setBase(q.data.design.version); setPast([]); setFuture([]); } }, [q.data]);

  const commit = useCallback((next: DesignDoc) => { setDoc((cur) => { if (cur) setPast((p) => [...p.slice(-60), cur]); return next; }); setFuture([]); }, []);
  const undo = () => { if (!past.length || !doc) return; setFuture((f) => [doc, ...f]); setDoc(past[past.length - 1]!); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length || !doc) return; setPast((p) => [...p, doc]); setDoc(future[0]!); setFuture((f) => f.slice(1)); };
  const [dragStart, setDragStart] = useState<DesignDoc | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && sel) { e.preventDefault(); duplicate(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) remove();
      else if (sel && e.key.startsWith("Arrow")) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; nudge(e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0, e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  if (q.error) return <MkPage title="Design editor" intro=""><p className="text-sm text-destructive">{(q.error as Error).message}</p></MkPage>;
  if (!q.data || !doc) return <MkPage title="Design editor" intro=""><p className="text-sm text-muted-foreground">Loading…</p></MkPage>;
  const kit: BrandKit = q.data.kit;
  const page = doc.pages[Math.min(pi, doc.pages.length - 1)]!;
  const layer = page.layers.find((l) => l.id === sel) ?? null;
  const { w, h } = DESIGN_FORMATS[doc.format], m = safeMargin(doc.format);
  const setLayers = (layers: Layer[], c = true) => { const next = { ...doc, pages: doc.pages.map((p, i) => (i === pi ? { ...p, layers } : p)) }; c ? commit(next) : setDoc(next); };
  const patch = (o: Partial<Layer>) => layer && setLayers(page.layers.map((l) => (l.id === layer.id ? ({ ...l, ...o } as Layer) : l)));
  const nudge = (dx: number, dy: number) => layer && !layer.locked && patch({ x: layer.x + dx, y: layer.y + dy });
  const remove = () => { if (layer && !layer.locked) { setLayers(page.layers.filter((l) => l.id !== layer.id)); setSel(null); } };
  const duplicate = () => { if (!layer) return; const c = { ...structuredClone(layer), id: uid(), x: layer.x + 30, y: layer.y + 30, locked: false }; setLayers([...page.layers, c]); setSel(c.id); };
  const reorder = (dir: -1 | 1) => { if (!layer) return; const i = page.layers.indexOf(layer), j = i + dir; if (j < 0 || j >= page.layers.length) return; const a = [...page.layers]; [a[i], a[j]] = [a[j]!, a[i]!]; setLayers(a); };
  const align = (k: string) => layer && !layer.locked && patch(k === "left" ? { x: m } : k === "center" ? { x: Math.round((w - layer.w) / 2) } : k === "right" ? { x: w - m - layer.w } : k === "top" ? { y: m } : k === "middle" ? { y: Math.round((h - layer.h) / 2) } : { y: h - m - layer.h });
  const add = (type: Layer["type"]) => {
    const base = { id: uid(), x: m, y: Math.round(h * 0.4), w: Math.round((w - 2 * m) / 2), h: Math.round(h * 0.15) };
    const white = colorHex(kit, "white"), cyan = colorHex(kit, "cyan");
    const l: Layer = type === "text" ? { ...base, type, text: "New text", font: "body", size: Math.round(w * 0.036), weight: 400, color: white, align: "left" }
      : type === "shape" ? { ...base, type, shape: "rect", fill: cyan, radius: 16, opacity: 1 }
      : type === "icon" ? { ...base, w: 120, h: 120, type, icon: "chart", color: cyan }
      : type === "chart" ? { ...base, w: w - 2 * m, h: Math.round(h * 0.3), type, chart: "bar", data: [{ label: "A", value: 1 }, { label: "B", value: 2 }], unit: "", color: cyan, source_url: "" }
      : { ...base, type: "image", src: "", fit: "cover", crop: { x: 0, y: 0, zoom: 1 } };
    setLayers([...page.layers, l]); setSel(l.id);
  };
  const addPage = (copy: boolean) => { const p = copy ? { ...structuredClone(page), id: uid("p"), layers: page.layers.map((l) => ({ ...structuredClone(l), id: uid() })) } : { id: uid("p"), background: page.background, layers: [] }; const pages = [...doc.pages]; pages.splice(pi + 1, 0, p); commit({ ...doc, pages }); setPi(pi + 1); };
  const delPage = () => { if (doc.pages.length < 2) return; commit({ ...doc, pages: doc.pages.filter((_, i) => i !== pi) }); setPi(Math.max(0, pi - 1)); };
  const movePage = (dir: -1 | 1) => { const j = pi + dir; if (j < 0 || j >= doc.pages.length) return; const a = [...doc.pages]; [a[pi], a[j]] = [a[j]!, a[pi]!]; commit({ ...doc, pages: a }); setPi(j); };
  const doSave = async () => {
    setSaving(true);
    try { const r = await save({ data: { id: designId, title, base_version: base, doc } }); setBase(r.version); toast.success(r.kind === "none" ? "No changes." : `Saved version ${r.version} (${r.kind === "material" ? "content change" : "layout/visual change"}).`); qc.invalidateQueries({ queryKey: ["design", designId] }); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const problems = designProblems(doc);
  const d = q.data.design, src: any = q.data.source;

  return (
    <MkPage title="Design editor" intro={`${DESIGN_FORMATS[doc.format].label} · ${w} × ${h} · saved v${base} · ${d.status}`}
      actions={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/marketing/design-studio">All designs</Link></Button><Button onClick={doSave} disabled={saving}>{saving ? "Saving…" : "Save version"}</Button></div>}>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
        <input className={`${inp} max-w-xs`} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Design title" />
        <Button size="sm" variant="ghost" onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 className="h-4 w-4" /></Button>
        {(["text", "image", "shape", "icon", "chart"] as const).map((t) => <Button key={t} size="sm" variant="outline" onClick={() => add(t)}>+ {t}</Button>)}
        <label className="flex items-center gap-1"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />Grid & snap</label>
        <Button size="sm" variant={preview ? "default" : "outline"} onClick={() => { setPreview(!preview); setSel(null); }}>{preview ? "Exit preview" : "Preview"}</Button>
        <select className={`${inp} w-auto`} value="" onChange={(e) => { if (e.target.value) { commit(resizeDesign(doc, e.target.value as DesignFormat)); toast.success("Re-flowed to the new size — check text wrapping."); } }}>
          <option value="">Resize to…</option>{Object.entries(DESIGN_FORMATS).filter(([k]) => k !== doc.format).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select>
        <select className={`${inp} w-auto`} value="" onChange={(e) => { if (e.target.value) commit(switchTemplate(doc, e.target.value as TemplateKey, kit)); }}>
          <option value="">Switch template…</option>{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[150px_1fr_300px]">
        <aside className="space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Pages</div>
          {doc.pages.map((p, i) => <button key={p.id} onClick={() => { setPi(i); setSel(null); }} className={`block w-full rounded border px-2 py-1 text-left text-xs ${i === pi ? "border-primary bg-muted" : "border-border"}`}>Page {i + 1} · {p.layers.length} layers</button>)}
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={() => addPage(false)}>+ Page</Button>
            <Button size="sm" variant="outline" onClick={() => addPage(true)} aria-label="Duplicate page"><Copy className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => movePage(-1)} aria-label="Move page up"><ArrowUp className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => movePage(1)} aria-label="Move page down"><ArrowDown className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" onClick={delPage} disabled={doc.pages.length < 2} aria-label="Delete page"><Trash2 className="h-3 w-3" /></Button>
          </div>
          <label className="block text-xs">Background<select className={inp} value={page.background} onChange={(e) => commit({ ...doc, pages: doc.pages.map((p, i) => (i === pi ? { ...p, background: e.target.value } : p)) })}>
            {kit.colors.map((c) => <option key={c.key} value={c.hex}>{c.label}</option>)}</select></label>
        </aside>

        <div className="mx-auto w-full" style={{ maxWidth: Math.min(720, 720 * (w / h)) }}>
          <DesignCanvas doc={doc} page={page} kit={kit} selected={preview ? null : sel} grid={grid} guides={!preview}
            onSelect={(id) => !preview && setSel(id)} onChange={(layers) => { if (!dragStart) setDragStart(doc); setLayers(layers, false); }}
            onCommit={() => { if (dragStart) { setPast((p) => [...p.slice(-60), dragStart]); setFuture([]); setDragStart(null); } }} />
          {!preview && <p className="mt-1 text-xs text-muted-foreground">Dashed line = safe margin. Drag to move, corner square to resize, arrows to nudge, Ctrl/⌘+Z undo, Ctrl/⌘+D duplicate.</p>}
        </div>

        <aside className="space-y-4 text-sm">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Layers (top first)</div>
            <div className="max-h-56 space-y-1 overflow-auto">{[...page.layers].reverse().map((l) => (
              <div key={l.id} className={`flex items-center gap-1 rounded border px-1 ${l.id === sel ? "border-primary bg-muted" : "border-border"}`}>
                <button className="flex-1 truncate py-1 text-left text-xs" onClick={() => setSel(l.id)}>{l.name || (l.type === "text" ? l.text.slice(0, 24) : l.type)}</button>
                <button aria-label="Toggle visibility" onClick={() => setLayers(page.layers.map((x) => (x.id === l.id ? { ...x, hidden: !x.hidden } : x)))}>{l.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</button>
                <button aria-label="Toggle lock" onClick={() => setLayers(page.layers.map((x) => (x.id === l.id ? { ...x, locked: !x.locked } : x)))}>{l.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}</button>
              </div>))}</div>
          </div>
          {layer && <LayerProps layer={layer} kit={kit} patch={patch} align={align} reorder={reorder} duplicate={duplicate} remove={remove} />}
          <div className="space-y-1 rounded-md border border-border p-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Checks</div>
            {problems.length ? problems.map((p) => <p key={p} className="text-xs text-destructive">{p}</p>) : <p className="text-xs text-muted-foreground">No problems found.</p>}
          </div>
          <div className="space-y-1 rounded-md border border-border p-2 text-xs">
            <div className="font-semibold uppercase text-muted-foreground">Source & history</div>
            {src ? (d.source_item_id ? <Link className="underline" to="/marketing/studio/content/$itemId" params={{ itemId: src.id }}>Article: {src.article_title}</Link> : <a className="underline" href={src.url} target="_blank" rel="noreferrer">Story: {src.headline}</a>) : <p className="text-muted-foreground">No linked source.</p>}
            {q.data.versions.slice(0, 8).map((v: any) => <div key={v.version} className="flex items-center justify-between"><span>v{v.version} · {v.change_kind} · {new Date(v.created_at).toLocaleString()}</span>
              {v.version !== base && <button className="underline" onClick={async () => { try { await restore({ data: { id: designId, version: v.version } }); qc.invalidateQueries({ queryKey: ["design", designId] }); toast.success("Restored as a new version."); } catch (e: any) { toast.error(e.message); } }}>Restore</button>}</div>)}
          </div>
        </aside>
      </div>
    </MkPage>
  );
}

function LayerProps({ layer: l, kit, patch, align, reorder, duplicate, remove }: { layer: Layer; kit: BrandKit; patch: (o: any) => void; align: (k: string) => void; reorder: (d: -1 | 1) => void; duplicate: () => void; remove: () => void }) {
  const colorSel = (v: string, key: string) => <select className={inp} value={v} onChange={(e) => patch({ [key]: e.target.value })}>{!kit.colors.some((c) => c.hex === v) && <option value={v}>{v}</option>}{kit.colors.map((c) => <option key={c.key} value={c.hex}>{c.label}</option>)}</select>;
  const num = (k: string, v: number, label: string, step = 1) => <label className="text-xs">{label}<input type="number" step={step} className={inp} value={v} onChange={(e) => patch({ [k]: Number(e.target.value) })} /></label>;
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex flex-wrap gap-1">
        {["left", "center", "right", "top", "middle", "bottom"].map((a) => <Button key={a} size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => align(a)}>{a}</Button>)}
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => reorder(1)} aria-label="Bring forward"><ArrowUp className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => reorder(-1)} aria-label="Send backward"><ArrowDown className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={duplicate} aria-label="Duplicate"><Copy className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={remove} disabled={l.locked} aria-label="Delete"><Trash2 className="h-3 w-3" /></Button>
      </div>
      <div className="grid grid-cols-4 gap-1">{num("x", l.x, "X")}{num("y", l.y, "Y")}{num("w", l.w, "W")}{num("h", l.h, "H")}</div>
      {l.type === "text" && <>
        <textarea className={inp} rows={3} value={l.text} onChange={(e) => patch({ text: e.target.value })} />
        {l.requires_founder_approval && <p className="text-xs text-destructive">Quotation attributed to Alyssa — needs her explicit approval before use.</p>}
        <div className="grid grid-cols-2 gap-1">
          <label className="text-xs">Font<select className={inp} value={l.font} onChange={(e) => patch({ font: e.target.value })}><option value="heading">{kit.typography.heading}</option><option value="body">{kit.typography.body}</option></select></label>
          {num("size", l.size, "Size")}
          <label className="text-xs">Weight<select className={inp} value={l.weight} onChange={(e) => patch({ weight: Number(e.target.value) })}>{[400, 500, 600, 700].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="text-xs">Align<select className={inp} value={l.align} onChange={(e) => patch({ align: e.target.value })}>{["left", "center", "right"].map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        <label className="text-xs">Color{colorSel(l.color, "color")}</label>
      </>}
      {l.type === "shape" && <>
        <label className="text-xs">Shape<select className={inp} value={l.shape} onChange={(e) => patch({ shape: e.target.value })}>{["rect", "ellipse", "line"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="text-xs">Fill{colorSel(l.fill, "fill")}</label>
        <div className="grid grid-cols-2 gap-1">{num("radius", l.radius, "Corner")}{num("opacity", l.opacity, "Opacity", 0.1)}</div>
      </>}
      {l.type === "icon" && <><label className="text-xs">Icon<select className={inp} value={l.icon} onChange={(e) => patch({ icon: e.target.value })}>{ICONS.map((x) => <option key={x}>{x}</option>)}</select></label><label className="text-xs">Color{colorSel(l.color, "color")}</label></>}
      {l.type === "image" && <>
        <label className="text-xs">Image<select className={inp} value={l.src.startsWith("logo:") ? l.src : ""} onChange={(e) => patch({ src: e.target.value, logo: e.target.value.startsWith("logo:") })}>
          <option value="">Custom image link</option>{kit.logos.map((g) => <option key={g.key} value={`logo:${g.key}`}>{g.label}</option>)}</select></label>
        {!l.src.startsWith("logo:") && <input className={inp} placeholder="https://… image link" value={l.src} onChange={(e) => patch({ src: e.target.value, logo: false })} />}
        <label className="text-xs">Fit<select className={inp} value={l.fit} onChange={(e) => patch({ fit: e.target.value })}><option value="cover">Fill & crop</option><option value="contain">Fit whole image</option></select></label>
        <div className="grid grid-cols-3 gap-1">
          <label className="text-xs">Zoom<input type="number" step={0.1} min={1} max={4} className={inp} value={l.crop.zoom} onChange={(e) => patch({ crop: { ...l.crop, zoom: Number(e.target.value) } })} /></label>
          <label className="text-xs">Pan X<input type="number" min={-50} max={50} className={inp} value={l.crop.x} onChange={(e) => patch({ crop: { ...l.crop, x: Number(e.target.value) } })} /></label>
          <label className="text-xs">Pan Y<input type="number" min={-50} max={50} className={inp} value={l.crop.y} onChange={(e) => patch({ crop: { ...l.crop, y: Number(e.target.value) } })} /></label>
        </div>
      </>}
      {l.type === "chart" && <>
        <label className="text-xs">Chart<select className={inp} value={l.chart} onChange={(e) => patch({ chart: e.target.value })}>{["bar", "line", "donut", "kpi"].map((x) => <option key={x}>{x}</option>)}</select></label>
        {l.data.map((p, i) => <div key={i} className="grid grid-cols-[1fr_80px_24px] gap-1">
          <input className={inp} value={p.label} onChange={(e) => patch({ data: l.data.map((q, j) => (j === i ? { ...q, label: e.target.value } : q)) })} />
          <input type="number" className={inp} value={p.value} onChange={(e) => patch({ data: l.data.map((q, j) => (j === i ? { ...q, value: Number(e.target.value) } : q)) })} />
          <button aria-label="Remove point" onClick={() => patch({ data: l.data.filter((_, j) => j !== i) })}>×</button></div>)}
        <Button size="sm" variant="outline" onClick={() => patch({ data: [...l.data, { label: "New", value: 0 }] })}>+ Data point</Button>
        <div className="grid grid-cols-2 gap-1"><label className="text-xs">Unit<input className={inp} value={l.unit} onChange={(e) => patch({ unit: e.target.value })} /></label><label className="text-xs">Color{colorSel(l.color, "color")}</label></div>
        <label className="text-xs">Source link (required)<input className={inp} value={l.source_url} onChange={(e) => patch({ source_url: e.target.value })} /></label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!l.issuer_reported} onChange={(e) => patch({ issuer_reported: e.target.checked })} />Issuer-reported figures (e.g. Form D)</label>
        {chartProblems(l).map((p) => <p key={p} className="text-xs text-destructive">{p}</p>)}
      </>}
      {!!l.claim_refs?.length && <div className="text-xs"><div className="font-semibold">Linked sources</div>{l.claim_refs.map((c, i) => <a key={i} className="block truncate underline" href={c.source_url} target="_blank" rel="noreferrer">{c.source_url}</a>)}</div>}
    </div>
  );
}
