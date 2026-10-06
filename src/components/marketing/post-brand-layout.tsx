/** Collateral Studio "Social Announcement" structure for post images. Colors come from BRAND (fixed export look), not theme tokens. */
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LayoutTemplate, Sparkles } from "lucide-react";
import logo from "@/assets/logo-white.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BRAND, brandProblems } from "@/lib/marketing-brand";
import { overflowProblems } from "@/components/marketing/collateral-canvas";
import { marketingBackgroundArt, marketingSuggestPostLayout, uploadMarketingAsset } from "@/lib/marketing.functions";

type Size = "square" | "landscape";
const DIM: Record<Size, { w: number; h: number }> = { square: { w: 1080, h: 1080 }, landscape: { w: 1200, h: 630 } };
const H = { fontFamily: "Rubik, sans-serif", fontWeight: 700 } as const;
const wrap = { hyphens: "none", overflowWrap: "normal", wordBreak: "keep-all" } as const;

export function PostBrandLayout({ title, body, onAdd }: { title: string; body: string; onAdd: (img: { path: string; url: string }) => void }) {
  const suggest = useServerFn(marketingSuggestPostLayout);
  const art = useServerFn(marketingBackgroundArt);
  const upload = useServerFn(uploadMarketingAsset);
  const [headline, setHeadline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [points, setPoints] = useState(["", "", ""]);
  const [size, setSize] = useState<Size>("square");
  const [footer, setFooter] = useState(true);
  const [bg, setBg] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "suggest" | "art" | "save">("");
  const [problems, setProblems] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const run = async (k: typeof busy, f: () => Promise<void>) => { setBusy(k); try { await f(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); } };
  const fill = () => run("suggest", async () => { const r = await suggest({ data: { title, body } }); setHeadline(r.headline); setSubtitle(r.subtitle); setPoints([0, 1, 2].map((i) => r.points[i] ?? "")); });
  const paint = () => run("art", async () => { setBg((await art({ data: { theme: `${title}. ${body.slice(0, 300)}` } })).dataUrl); });
  const save = () => run("save", async () => {
    const text = [headline, subtitle, ...points].join("\n");
    const p = [...brandProblems(text), ...overflowProblems(ref.current)];
    if (!headline.trim()) p.unshift("Add a headline.");
    setProblems(p);
    if (p.length || !ref.current) return;
    const { toPng } = await import("html-to-image");
    const { w, h } = DIM[size];
    const url = await toPng(ref.current.firstElementChild as HTMLElement, { pixelRatio: 1, cacheBust: true, width: w, height: h, style: { transform: "none" } });
    const r = await upload({ data: { fileName: "brand-layout.png", contentType: "image/png", base64: url.split(",")[1]! } });
    onAdd(r); toast.success("Brand image added");
  });

  const { w, h } = DIM[size];
  const land = size === "landscape";
  const scale = 340 / w;
  const pts = points.filter((x) => x.trim());

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={fill} disabled={!!busy || body.trim().length < 10}><Sparkles className="mr-1 h-4 w-4" />{busy === "suggest" ? "Writing…" : "Fill from post text"}</Button>
        <Button variant="outline" size="sm" onClick={paint} disabled={!!busy || body.trim().length < 10}>{busy === "art" ? "Painting…" : bg ? "New background art" : "Add background art"}</Button>
        {bg && <Button variant="ghost" size="sm" onClick={() => setBg(null)}>Remove art</Button>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label>Headline</Label><Input value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} /></div>
        <div><Label>Subtitle</Label><Input value={subtitle} maxLength={160} onChange={(e) => setSubtitle(e.target.value)} /></div>
        {points.map((p, i) => <div key={i}><Label>Value point {i + 1}</Label><Input value={p} maxLength={60} onChange={(e) => setPoints((x) => x.map((y, j) => j === i ? e.target.value : y))} /></div>)}
        <div><Label>Size</Label><div className="mt-2 flex gap-2">{(["square", "landscape"] as Size[]).map((s) => <Button key={s} size="sm" variant={size === s ? "default" : "outline"} onClick={() => setSize(s)}>{s === "square" ? "Square 1080" : "Landscape 1200×630"}</Button>)}</div></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={footer} onCheckedChange={(v) => setFooter(!!v)} />Proof-point footer and logo</label>

      <div className="overflow-hidden rounded" style={{ width: w * scale, height: h * scale }}>
        <div ref={ref} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: w, height: h }}>
          <div data-collateral-page style={{ ...wrap, fontFamily: "Poppins, sans-serif", width: w, height: h, position: "relative", overflow: "hidden", color: "#fff", boxSizing: "border-box", padding: land ? 56 : 80, display: "flex", flexDirection: "column",
            background: `${bg ? `linear-gradient(180deg, rgba(0,40,86,0.55) 0%, rgba(0,20,51,0.92) 70%), url(${bg}) center/cover, ` : ""}radial-gradient(circle at 92% 4%, rgba(93,198,209,0.18), transparent 32%), linear-gradient(180deg, ${BRAND.navy} 0%, ${BRAND.midnight} 100%)` }}>
            <div style={{ color: BRAND.cyan, fontSize: 18, letterSpacing: 1.5, textTransform: "uppercase" }}>Harmonious</div>
            <div style={{ marginTop: land ? 24 : 90 }}>
              <div style={{ ...H, fontSize: land ? 56 : 76, lineHeight: 1.05 }}>{headline || "Your headline"}</div>
              {subtitle && <div style={{ fontSize: land ? 24 : 32, marginTop: 18, opacity: 0.9, maxWidth: w - 200 }}>{subtitle}</div>}
            </div>
            {pts.length > 0 && <div style={{ display: "grid", gridTemplateColumns: `repeat(${pts.length},1fr)`, gap: 20, marginTop: land ? 28 : 64 }}>
              {pts.map((p, i) => <div key={i} style={{ background: "#fff", border: `1px solid ${BRAND.slate}`, borderRadius: 18, padding: land ? 20 : 28, borderTop: `4px solid ${BRAND.cyan}` }}><div style={{ ...H, fontSize: land ? 22 : 26, color: BRAND.navy }}>{p}</div></div>)}
            </div>}
            {footer && <div style={{ marginTop: "auto", borderTop: `2px solid ${BRAND.cyan}`, paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: land ? 18 : 22 }}>{BRAND.proof}</div>
              <img src={logo.url} alt="Harmonious" crossOrigin="anonymous" style={{ height: land ? 40 : 50 }} />
            </div>}
          </div>
        </div>
      </div>
      {problems.length > 0 && <ul className="list-disc pl-5 text-xs text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <Button size="sm" onClick={save} disabled={!!busy}><LayoutTemplate className="mr-1 h-4 w-4" />{busy === "save" ? "Saving…" : "Add to post"}</Button>
    </div>
  );
}
