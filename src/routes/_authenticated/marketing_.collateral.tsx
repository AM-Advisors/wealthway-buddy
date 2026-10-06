import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollateralPages, overflowProblems } from "@/components/marketing/collateral-canvas";
import { TEMPLATES, defaults, toMarkdown, type CollateralContent, type TemplateId } from "@/lib/collateral-templates";
import { BRAND_RULES, brandProblems } from "@/lib/marketing-brand";
import { decideMarketingCollateral, listMarketingCollateral, saveMarketingCollateral, storeMarketingCollateralExport } from "@/lib/marketing-collateral.functions";

export const Route = createFileRoute("/_authenticated/marketing_/collateral")({
  head: () => ({ meta: [
    { title: "Collateral Studio - Harmonious Marketing" },
    { name: "description", content: "Build on-brand SPV, Fund of Funds, Cap Table and social collateral with built-in brand checks." },
    { property: "og:title", content: "Collateral Studio - Harmonious Marketing" },
    { property: "og:description", content: "On-brand collateral with built-in brand checks, approval and export." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Studio,
});

const STATUS: Record<string, string> = { draft: "Draft", submitted: "Waiting for approval", approved: "Approved", rejected: "Sent back" };

function download(name: string, href: string) { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); }

function Studio() {
  const qc = useQueryClient();
  const list = useServerFn(listMarketingCollateral), save = useServerFn(saveMarketingCollateral), decide = useServerFn(decideMarketingCollateral), store = useServerFn(storeMarketingCollateralExport);
  const q = useQuery({ queryKey: ["mk-collateral"], queryFn: () => list() });
  const [template, setTemplate] = useState<TemplateId>("spv");
  const [c, setC] = useState<CollateralContent>(() => defaults("spv"));
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [layoutIssues, setLayoutIssues] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const current = q.data?.items.find((i: any) => i.id === id) as any;

  const textIssues = useMemo(() => brandProblems(JSON.stringify(c)), [c]);
  useEffect(() => { const t = setTimeout(() => setLayoutIssues(overflowProblems(ref.current)), 300); return () => clearTimeout(t); }, [c, template]);
  const issues = [...textIssues, ...layoutIssues];
  const set = <K extends keyof CollateralContent>(k: K, v: CollateralContent[K]) => setC((p) => ({ ...p, [k]: v }));

  const pick = (t: TemplateId) => { setTemplate(t); setC(defaults(t)); setId(null); };
  const open = async (row: any) => {
    const { getMarketingCollateral } = await import("@/lib/marketing-collateral.functions");
    const full: any = await getMarketingCollateral({ data: { id: row.id } });
    setTemplate(full.template); setC({ ...defaults(full.template), ...full.content }); setId(full.id);
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await qc.invalidateQueries({ queryKey: ["mk-collateral"] }); }
    catch (e: any) { toast.error(e?.message ?? "Something went wrong."); }
    finally { setBusy(false); }
  };
  const onSave = () => run(async () => { const r = await save({ data: { id, template, title: c.title, content: c as any } }); setId(r.id); }, "Saved as draft.");

  const render = async () => {
    const { toJpeg } = await import("html-to-image");
    await document.fonts.ready;
    const pages = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-collateral-page]") ?? []);
    return Promise.all(pages.map((p) => toJpeg(p, { quality: 0.95, pixelRatio: 1, cacheBust: true, width: p.offsetWidth, height: p.offsetHeight, style: { transform: "none" } })));
  };
  const exportFiles = (kind: "jpg" | "pdf" | "md") => run(async () => {
    if (issues.length) throw new Error("Fix the brand checks before exporting.");
    const slug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (kind === "md") return download(`${slug}-guide.md`, URL.createObjectURL(new Blob([toMarkdown(c)], { type: "text/markdown" })));
    const imgs = await render();
    if (kind === "jpg") return imgs.forEach((src, i) => download(`${slug}-p${i + 1}.jpg`, src));
    const pdf = await makePdf(imgs, template === "social");
    pdf.save(`${slug}.pdf`);
  }, "Export ready.");
  const saveForSharing = () => run(async () => {
    if (!id) throw new Error("Save first.");
    const pdf = await makePdf(await render(), template === "social");
    const base64 = pdf.output("datauristring").split(",")[1] ?? "";
    const r = await store({ data: { id, base64 } });
    if (r.url) window.open(r.url, "_blank");
  }, "Saved for sharing.");

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Collateral Studio</h1>
        <p className="text-sm text-muted-foreground">Pick a template, edit the content, and export on-brand sheets. Layout, colors and fonts are fixed by the Harmonious brand rules.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <section className="space-y-2 rounded-lg border border-border p-4">
            <label className="text-xs font-medium text-muted-foreground">Template</label>
            <Select value={template} onValueChange={(v) => pick(v as TemplateId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={c.title} onChange={(e) => set("title", e.target.value)} placeholder="Title" />
            <Input value={c.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="Subtitle" />
            <Input value={c.hookLead} onChange={(e) => set("hookLead", e.target.value)} placeholder="Opening hook" />
            {template !== "social" && <Textarea rows={4} value={c.hook} onChange={(e) => set("hook", e.target.value)} />}
            {template !== "social" && (
              <div className="grid grid-cols-2 gap-2">
                <Select value={c.structure} onValueChange={(v) => set("structure", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="both">Series or Stand-Alone</SelectItem><SelectItem value="series">Delaware Series</SelectItem><SelectItem value="standalone">Stand-Alone</SelectItem></SelectContent>
                </Select>
                <Select value={c.reg} onValueChange={(v) => set("reg", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="both">506(b) &amp; 506(c)</SelectItem><SelectItem value="506b">506(b)</SelectItem><SelectItem value="506c">506(c)</SelectItem></SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center justify-between text-sm">Proof-point footer <Switch checked={c.showFooter} onCheckedChange={(v) => set("showFooter", v)} /></label>
          </section>

          <section className="space-y-2 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Value points</h2>
            {c.pillars.map((p, i) => (
              <div key={i} className="space-y-1">
                <Input value={p.title} onChange={(e) => set("pillars", c.pillars.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <Textarea rows={2} value={p.body} onChange={(e) => set("pillars", c.pillars.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} />
              </div>
            ))}
          </section>

          {template !== "social" && (
            <section className="space-y-2 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold">Services (up to 6 shown)</h2>
              {c.services.map((s, i) => (
                <div key={i} className="space-y-1 border-t border-border pt-2 first:border-0 first:pt-0">
                  <label className="flex items-center justify-between text-sm"><span className="font-medium">{s.title}</span><Switch checked={s.on} onCheckedChange={(v) => set("services", c.services.map((x, j) => j === i ? { ...x, on: v } : x))} /></label>
                  {s.on && <Textarea rows={3} value={s.points.join("\n")} onChange={(e) => set("services", c.services.map((x, j) => j === i ? { ...x, points: e.target.value.split("\n").filter(Boolean) } : x))} />}
                </div>
              ))}
            </section>
          )}

          <section className="space-y-2 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Brand checks</h2>
            {issues.length === 0 ? <p className="text-sm text-muted-foreground">All checks pass.</p> : <ul className="space-y-1 text-sm text-destructive">{issues.map((x) => <li key={x}>• {x}</li>)}</ul>}
          </section>

          <section className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Save &amp; approve</h2>{current && <Badge variant="secondary">{STATUS[current.status]}</Badge>}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={onSave}>Save draft</Button>
              {id && <Button size="sm" variant="outline" disabled={busy || !!issues.length} onClick={() => run(() => decide({ data: { id, action: "submit" } }), "Submitted for approval.")}>Submit</Button>}
              {id && current?.status === "submitted" && q.data?.canApprove && current.author_id !== q.data.userId && (
                <>
                  <Button size="sm" disabled={busy} onClick={() => run(() => decide({ data: { id, action: "approve" } }), "Approved.")}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => decide({ data: { id, action: "reject" } }), "Sent back.")}>Send back</Button>
                </>
              )}
              {id && current?.status === "approved" && <Button size="sm" variant="secondary" disabled={busy} onClick={saveForSharing}>Save PDF for sharing</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Any edit returns it to draft. Someone other than the author approves.</p>
          </section>

          <section className="space-y-2 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Export</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => exportFiles("pdf")}>PDF</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => exportFiles("jpg")}>JPEGs</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => exportFiles("md")}>Written guide</Button>
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Brand rules</h2>
            <ul className="space-y-1 text-xs text-muted-foreground">{BRAND_RULES.map((r) => <li key={r}>• {r}</li>)}</ul>
          </section>

          <section className="space-y-2 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Saved collateral</h2>
            {(q.data?.items ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
            {(q.data?.items ?? []).map((r: any) => (
              <button key={r.id} onClick={() => open(r)} className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-muted">
                <span className="truncate">{r.title}</span><Badge variant="outline">{STATUS[r.status]}</Badge>
              </button>
            ))}
          </section>
        </aside>

        <div className="overflow-hidden rounded-lg border border-border bg-muted/40 p-4">
          <div style={{ width: 1600, transform: "scale(0.45)", transformOrigin: "top left", height: 0 }}>
            <CollateralPages ref={ref} c={c} social={template === "social"} />
          </div>
          <div style={{ height: template === "social" ? 1600 * 0.45 : (4000 + 40) * 0.45 }} />
        </div>
      </div>
    </main>
  );
}

async function makePdf(imgs: string[], social: boolean) {
  const { jsPDF } = await import("jspdf");
  const w = 1600, h = social ? 1600 : 2000;
  const pdf = new jsPDF({ unit: "px", format: [w, h], orientation: "portrait", hotfixes: ["px_scaling"] });
  imgs.forEach((src, i) => { if (i) pdf.addPage([w, h], "portrait"); pdf.addImage(src, "JPEG", 0, 0, w, h); });
  return pdf;
}
