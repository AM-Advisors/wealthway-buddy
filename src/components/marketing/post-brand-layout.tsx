/** Branded post designer: several styles plus carousels. Artwork colors use stable global brand tokens. Exactly one logo per image. */
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, LayoutTemplate, Plus, Sparkles, Trash2 } from "lucide-react";
import logoWhite from "@/assets/logo-white.png.asset.json";
import logoNavy from "@/assets/logo-navy.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { carouselContentCount, POST_PALETTES, resizeCarouselDrafts } from "./post-design-options";
import { BRAND, brandProblems } from "@/lib/marketing-brand";
import { overflowProblems } from "@/components/marketing/collateral-canvas";
import { marketingBackgroundArt, marketingSuggestPostLayout, uploadMarketingAsset } from "@/lib/marketing.functions";

type Size = "square" | "portrait" | "landscape" | "story";
type Style = "cards" | "statement" | "stat" | "quote" | "checklist" | "photo" | "event" | "carousel";
type Bg = "navy" | "glow" | "light" | "art";
type Slide = { title: string; text: string };

const DIM: Record<Size, { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: "Square" }, portrait: { w: 1080, h: 1350, label: "Portrait 4:5" },
  landscape: { w: 1200, h: 630, label: "Landscape" }, story: { w: 1080, h: 1920, label: "Story" },
};
const STYLES: { id: Style; label: string; hint: string }[] = [
  { id: "cards", label: "Value cards", hint: "Headline, subtitle, 3 cards" },
  { id: "statement", label: "Big statement", hint: "One bold line" },
  { id: "stat", label: "Stat spotlight", hint: "One big number" },
  { id: "quote", label: "Quote", hint: "Quote with name" },
  { id: "checklist", label: "Checklist", hint: "Up to 5 tips" },
  { id: "photo", label: "Photo split", hint: "Image + text" },
  { id: "event", label: "Event", hint: "Title, date, register" },
  { id: "carousel", label: "Carousel", hint: "3-10 swipe slides" },
];
const H = { fontFamily: BRAND.headingFont, fontWeight: 700, letterSpacing: 0 } as const;
const wrap = { hyphens: "none", overflowWrap: "normal", wordBreak: "keep-all" } as const;

/** Render the headline with one chosen word in cyan. */
function Hl({ text, word, accent }: { text: string; word: string; accent: string }) {
  const w = word.trim().toLowerCase();
  if (!w) return <>{text}</>;
  return <>{text.split(/(\s+)/).map((t, i) => t.replace(/[^\w$%+]/g, "").toLowerCase() === w ? <span key={i} style={{ color: accent }}>{t}</span> : t)}</>;
}

export function PostBrandLayout({ title, body, onAdd }: { title: string; body: string; onAdd: (img: { path: string; url: string }) => void }) {
  const suggest = useServerFn(marketingSuggestPostLayout);
  const art = useServerFn(marketingBackgroundArt);
  const upload = useServerFn(uploadMarketingAsset);
  const [style, setStyle] = useState<Style>("cards");
  const [headline, setHeadline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [points, setPoints] = useState(["", "", "", "", ""]);
  const [stat, setStat] = useState("");
  const [attribution, setAttribution] = useState("");
  const [cta, setCta] = useState("");
  const [highlight, setHighlight] = useState("");
  const [slideDrafts, setSlides] = useState<Slide[]>([{ title: "", text: "" }, { title: "", text: "" }]);
  const [slideCount, setSlideCount] = useState(4);
  const [paletteId, setPaletteId] = useState<string>("navy");
  const slides = slideDrafts.slice(0, carouselContentCount(slideCount));
  const chooseSlideCount = (count: number) => { setSlideCount(count); setSlides((x) => resizeCarouselDrafts(x, count)); };
  const [size, setSize] = useState<Size>("square");
  const [bgMode, setBgMode] = useState<Bg>("glow");
  const [footer, setFooter] = useState(true);
  const [bg, setBg] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "suggest" | "art" | "save">("");
  const [problems, setProblems] = useState<string[]>([]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  const carousel = style === "carousel";
  const nPoints = style === "checklist" ? 5 : style === "cards" ? 3 : 0;
  const run = async (k: typeof busy, f: () => Promise<void>) => { setBusy(k); try { await f(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); } };
  const fill = () => run("suggest", async () => {
    const r = await suggest({ data: { title, body: carousel ? `${body}\n\nCarousel layout request: ${slideCount} total slides, including one cover and one closing slide; ${carouselContentCount(slideCount)} content slides.` : body, style } });
    setHeadline(r.headline); setSubtitle(r.subtitle); setStat(r.stat); setAttribution(r.attribution); setCta(r.cta);
    setPoints([0, 1, 2, 3, 4].map((i) => r.points[i] ?? ""));
    if (carousel && r.slides.length) setSlides(resizeCarouselDrafts(r.slides.slice(0, carouselContentCount(slideCount)), slideCount));
  });
  const paint = () => run("art", async () => { setBg((await art({ data: { theme: `${title}. ${body.slice(0, 300)}` } })).dataUrl); if (bgMode !== "art" && style !== "photo") setBgMode("art"); });

  const { w, h } = DIM[size];
  const land = size === "landscape";
  const light = bgMode === "light";
  const palette = POST_PALETTES.find((p) => p.id === paletteId) ?? POST_PALETTES[0];
  const accent = light ? palette.lightAccent : palette.accent;
  const ink = light ? "var(--brand-navy)" : "var(--brand-white)";
  const pad = land ? 56 : 80;
  const pts = points.slice(0, nPoints).filter((x) => x.trim());
  const total = carousel ? slides.length + 2 : 1;

  const save = () => run("save", async () => {
    const text = [headline, subtitle, stat, attribution, cta, ...pts, ...(carousel ? slides.flatMap((s) => [s.title, s.text]) : [])].join("\n");
    const nodes = refs.current.slice(0, total).filter(Boolean) as HTMLDivElement[];
    const p = [...brandProblems(text), ...nodes.flatMap((n) => overflowProblems(n))];
    if (!headline.trim()) p.unshift("Add a headline.");
    if (carousel && slides.some((s) => !s.title.trim() && !s.text.trim())) p.push("Fill or remove empty slides.");
    if (style === "photo" && !bg) p.push("Add a photo (background art) for the photo split style.");
    setProblems([...new Set(p)]);
    if (p.length || !nodes.length) return;
    // Explicitly load the actual brand faces before capture: fallback fonts must never be exported.
    const faces = await Promise.all([
      document.fonts.load('700 76px "Rubik"'),
      document.fonts.load('400 32px "Poppins"'),
    ]);
    await document.fonts.ready;
    if (faces.some((face) => face.length === 0)) throw new Error("The Harmonious fonts could not load. Please try again before saving.");
    const { toPng } = await import("html-to-image");
    for (let i = 0; i < nodes.length; i++) {
      const page = nodes[i]?.firstElementChild;
      if (!(page instanceof HTMLElement)) throw new Error("The post preview is not ready. Please try again.");
      // Freeze resolved colors/fonts inline so the export never depends on theme variables or stylesheets.
      const els = [page, ...Array.from(page.querySelectorAll<HTMLElement>("*"))];
      const saved = els.map((el) => el.style.cssText);
      els.forEach((el) => {
        const cs = getComputedStyle(el);
        for (const prop of ["color", "background-color", "background-image", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "font-family", "font-weight"]) {
          el.style.setProperty(prop, cs.getPropertyValue(prop));
        }
      });
      let url: string;
      try {
        url = await toPng(page, { pixelRatio: 1, cacheBust: true, width: w, height: h, style: { transform: "none" } });
      } finally {
        els.forEach((el, k) => { el.style.cssText = saved[k] ?? ""; });
      }
      const base64 = url.split(",")[1];
      if (!base64) throw new Error("The post image could not be saved. Please try again.");
      const r = await upload({ data: { fileName: carousel ? `carousel-${i + 1}.png` : "brand-layout.png", contentType: "image/png", base64 } });
      onAdd(r);
    }
    toast.success(carousel ? `${nodes.length} carousel slides added in order` : "Brand image added");
  });

  const background = (allowArt: boolean) => {
    if (light) return `linear-gradient(135deg, color-mix(in srgb, ${palette.accent} 12%, var(--brand-white)), var(--brand-white) 60%)`;
    const glow = bgMode === "navy" ? "" : `linear-gradient(135deg, color-mix(in srgb, ${palette.accent} 18%, transparent), transparent 60%), `;
    const artLayer = allowArt && bgMode === "art" && bg ? `var(--post-art-overlay), url(${bg}) center/cover, ` : "";
    return `${artLayer}${glow}linear-gradient(180deg, ${palette.surface} 0%, var(--post-midnight) 100%)`;
  };
  const logo = light ? logoNavy.url : logoWhite.url;
  // Original lighthouse + wordmark artwork; never redraw or squeeze the logo to fit the footer.
  const Logo = () => <img src={logo} alt="Harmonious" crossOrigin="anonymous" width={1917} height={449} style={{ width: land ? 200 : 220, height: "auto", aspectRatio: "1917 / 449", objectFit: "contain", flexShrink: 0 }} />;
  const Footer = ({ withLogo = true }: { withLogo?: boolean }) => <div style={{ marginTop: "auto", borderTop: `2px solid ${accent}`, paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
    <div style={{ fontSize: land ? 18 : 22, lineHeight: 1.5, minWidth: 0 }}><div>$24B+ AUA · 750+ Fund Managers</div><div>Your Funds On Easy Mode</div></div>{withLogo && <Logo />}
  </div>;
  const Cta = () => cta.trim() ? <div style={{ alignSelf: "flex-start", marginTop: 32, background: accent, color: light ? "var(--brand-white)" : "var(--brand-navy)", ...H, fontSize: land ? 22 : 28, padding: "14px 28px", borderRadius: 999 }}>{cta}</div> : null;

  /** One canvas page. Logo appears once: in the footer, or top-right when the footer is off. */
  const Page = ({ i, children, logoHere = true, artOk = true, padOverride, pageNo }: { i: number; children: ReactNode; logoHere?: boolean; artOk?: boolean; padOverride?: CSSProperties; pageNo?: string }) => (
    <div className="shrink-0 overflow-hidden rounded" style={{ width: w * scale, height: h * scale }}>
      <div ref={(el) => { refs.current[i] = el; }} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: w, height: h }}>
        <div data-collateral-page style={{ ...wrap, fontFamily: BRAND.bodyFont, fontWeight: 400, letterSpacing: 0, width: w, height: h, position: "relative", overflow: "hidden", color: ink, boxSizing: "border-box", padding: pad, display: "flex", flexDirection: "column", background: background(artOk), ...padOverride }}>
          {logoHere && !footer && <div style={{ position: "absolute", top: pad, right: pad }}><Logo /></div>}
          {pageNo && <div style={{ position: "absolute", top: pad, left: pad, fontSize: 22, color: accent, letterSpacing: 1 }}>{pageNo}</div>}
          {children}
          {footer && <Footer withLogo={logoHere} />}
        </div>
      </div>
    </div>
  );

  const head = (fs: number) => <div style={{ ...H, fontSize: land ? fs * 0.72 : fs, lineHeight: 1.05 }}><Hl text={headline || "Your headline"} word={highlight} accent={accent} /></div>;
  const sub = subtitle && <div style={{ fontSize: land ? 24 : 32, marginTop: 18, opacity: 0.9, maxWidth: w - 200 }}>{subtitle}</div>;
  const topGap = land ? 24 : footer ? 90 : 140;
  const scale = (carousel ? 260 : 340) / w;

  const single = () => {
    switch (style) {
      case "statement": return <Page i={0}><div style={{ margin: "auto 0" }}>{head(104)}{sub}<Cta /></div></Page>;
      case "stat": return <Page i={0}><div style={{ margin: "auto 0" }}>
        <div style={{ ...H, fontSize: land ? 140 : 220, lineHeight: 1, color: accent }}>{stat || "$24B+"}</div>
        <div style={{ marginTop: 24 }}>{head(60)}</div>{sub}</div></Page>;
      case "quote": return <Page i={0}><div style={{ margin: "auto 0" }}>
        <div style={{ ...H, fontSize: land ? 120 : 200, lineHeight: 0.6, color: accent }}>“</div>
        <div style={{ ...H, fontSize: land ? 40 : 58, lineHeight: 1.2, marginTop: 20 }}><Hl text={headline || "Your quote"} word={highlight} accent={accent} /></div>
        {attribution && <div style={{ fontSize: land ? 22 : 28, marginTop: 28, opacity: 0.85 }}>— {attribution}</div>}</div></Page>;
      case "checklist": return <Page i={0}><div style={{ marginTop: topGap }}>{head(68)}{sub}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: land ? 12 : 20, marginTop: land ? 24 : 48 }}>
          {pts.map((p, k) => <div key={k} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ ...H, flexShrink: 0, width: land ? 40 : 56, height: land ? 40 : 56, borderRadius: 999, background: accent, color: light ? "var(--brand-white)" : "var(--brand-navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: land ? 20 : 26 }}>{k + 1}</div>
            <div style={{ fontSize: land ? 24 : 34 }}>{p}</div></div>)}
        </div></Page>;
      case "photo": return <Page i={0} artOk={false} padOverride={{ paddingLeft: w * 0.5 + pad / 2 }}>
        <div style={{ position: "absolute", inset: 0, right: "50%", background: bg ? `url(${bg}) center/cover` : "var(--post-border)" }} />
        <div style={{ margin: "auto 0" }}>{head(64)}{sub}<Cta /></div></Page>;
      case "event": return <Page i={0}><div style={{ marginTop: topGap }}>
        <div style={{ color: accent, fontSize: land ? 20 : 26, letterSpacing: 2, textTransform: "uppercase" }}>Live event</div>
        <div style={{ marginTop: 16 }}>{head(80)}</div>{sub}<Cta /></div></Page>;
      default: return <Page i={0}><div style={{ marginTop: topGap }}>{head(76)}{sub}</div>
        {pts.length > 0 && <div style={{ display: "grid", gridTemplateColumns: `repeat(${pts.length},1fr)`, gap: 20, marginTop: land ? 28 : 64 }}>
          {pts.map((p, k) => <div key={k} style={{ background: "var(--brand-white)", border: `1px solid ${"var(--post-border)"}`, borderRadius: 18, padding: land ? 20 : 28, borderTop: `4px solid ${accent}` }}><div style={{ ...H, fontSize: land ? 22 : 26, color: "var(--brand-navy)" }}>{p}</div></div>)}
        </div>}<Cta /></Page>;
    }
  };

  const deck = () => <div className="flex gap-2 overflow-x-auto pb-2">
    <Page i={0} pageNo={`1/${total}`}><div style={{ margin: "auto 0" }}>{head(92)}{sub}
      <div style={{ marginTop: 40, fontSize: land ? 22 : 28, color: accent }}>Swipe →</div></div></Page>
    {slides.map((s, k) => <Page key={k} i={k + 1} pageNo={`${k + 2}/${total}`}><div style={{ margin: "auto 0" }}>
      <div style={{ ...H, fontSize: land ? 44 : 64, lineHeight: 1.1 }}>{s.title}</div>
      <div style={{ fontSize: land ? 24 : 34, marginTop: 24, opacity: 0.9, lineHeight: 1.4 }}>{s.text}</div></div></Page>)}
    <Page i={slides.length + 1} pageNo={`${total}/${total}`}><div style={{ margin: "auto 0" }}>
      <div style={{ ...H, fontSize: land ? 52 : 76, lineHeight: 1.05 }}>{cta || "Follow for more"}</div>
      <div style={{ fontSize: land ? 24 : 30, marginTop: 20, opacity: 0.9 }}>harmonious.co</div></div></Page>
  </div>;

  const moveSlide = (k: number, d: number) => setSlides((x) => { const y = [...x]; const t = y[k + d]; const current = y[k]; if (!t || !current) return x; y[k + d] = current; y[k] = t; return y; });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label>Style</Label>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
           {STYLES.map((s) => <Button key={s.id} type="button" variant="outline" aria-pressed={style === s.id} onClick={() => setStyle(s.id)}
            className={`h-auto flex-col items-start whitespace-normal p-2 text-left text-xs ${style === s.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
            <span className="font-medium text-foreground">{s.label}</span><span className="text-muted-foreground">{s.hint}</span></Button>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={fill} disabled={!!busy || body.trim().length < 10}><Sparkles className="mr-1 h-4 w-4" />{busy === "suggest" ? "Writing…" : "Fill from post text"}</Button>
        <Button variant="outline" size="sm" onClick={paint} disabled={!!busy || body.trim().length < 10}>{busy === "art" ? "Painting…" : bg ? (style === "photo" ? "New photo" : "New background art") : (style === "photo" ? "Generate photo" : "Add background art")}</Button>
        {bg && <Button variant="ghost" size="sm" onClick={() => setBg(null)}>Remove art</Button>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label>{style === "quote" ? "Quote" : carousel ? "Cover title" : "Headline"}</Label><Input value={headline} maxLength={style === "quote" ? 200 : 80} onChange={(e) => setHeadline(e.target.value)} /></div>
        {style !== "quote" && <div><Label>{carousel ? "Cover hook" : style === "event" ? "Date and time" : "Subtitle"}</Label><Input value={subtitle} maxLength={160} onChange={(e) => setSubtitle(e.target.value)} /></div>}
        {style === "quote" && <div><Label>Name and role</Label><Input value={attribution} maxLength={80} onChange={(e) => setAttribution(e.target.value)} /></div>}
        {style === "stat" && <div><Label>Big number</Label><Input value={stat} maxLength={12} placeholder="$24B+" onChange={(e) => setStat(e.target.value)} /></div>}
        <div><Label>Highlight word</Label><Input value={highlight} maxLength={30} placeholder="e.g. Complexity" onChange={(e) => setHighlight(e.target.value)} /></div>
        {["cards", "statement", "photo", "event", "carousel"].includes(style) && <div><Label>{carousel ? "Closing call-to-action" : "Call-to-action button (optional)"}</Label><Input value={cta} maxLength={50} placeholder={carousel ? "Book a demo" : "Learn more at harmonious.co"} onChange={(e) => setCta(e.target.value)} /></div>}
        {points.slice(0, nPoints).map((p, i) => <div key={i}><Label>{style === "checklist" ? `Tip ${i + 1}` : `Value point ${i + 1}`}</Label><Input value={p} maxLength={style === "checklist" ? 70 : 60} onChange={(e) => setPoints((x) => x.map((y, j) => j === i ? e.target.value : y))} /></div>)}
      </div>
      {carousel && <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3"><Label htmlFor="carousel-count">Total slides</Label><Select value={String(slideCount)} onValueChange={(v) => chooseSlideCount(Number(v))} disabled={!!busy}><SelectTrigger id="carousel-count" className="w-32"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 8 }, (_, i) => i + 3).map((n) => <SelectItem key={n} value={String(n)}>{n} slides</SelectItem>)}</SelectContent></Select><span className="text-xs text-muted-foreground">1 cover · {slides.length} content · 1 closing</span></div>
        {slides.map((s, k) => <div key={k} className="flex gap-2 rounded-md border p-2">
          <div className="flex-1 space-y-1">
            <Input value={s.title} maxLength={60} placeholder={`Slide ${k + 2} title`} onChange={(e) => setSlides((x) => x.map((y, j) => j === k ? { ...y, title: e.target.value } : y))} />
            <Textarea value={s.text} maxLength={220} rows={2} placeholder="Slide text" onChange={(e) => setSlides((x) => x.map((y, j) => j === k ? { ...y, text: e.target.value } : y))} />
          </div>
          <div className="flex flex-col gap-1">
            <Button size="icon" variant="ghost" aria-label="Move up" disabled={k === 0} onClick={() => moveSlide(k, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Move down" disabled={k === slides.length - 1} onClick={() => moveSlide(k, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Remove slide" disabled={slides.length <= 1 || !!busy} onClick={() => { setSlides((x) => x.filter((_, j) => j !== k)); setSlideCount((n) => n - 1); }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>)}
        <Button size="sm" variant="outline" disabled={slides.length >= 8 || !!busy} onClick={() => chooseSlideCount(slideCount + 1)}><Plus className="mr-1 h-4 w-4" />Add slide</Button>
      </div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label>Size</Label><div className="mt-2 flex flex-wrap gap-2">{(Object.keys(DIM) as Size[]).map((s) => <Button key={s} size="sm" variant={size === s ? "default" : "outline"} onClick={() => setSize(s)}>{DIM[s].label}</Button>)}</div></div>
        <div><Label>Background</Label><div className="mt-2 flex flex-wrap gap-2">{([["navy", "Dark"], ["glow", "Color wash"], ["light", "Light"], ["art", "AI art"]] as [Bg, string][]).map(([k, l]) => <Button key={k} size="sm" variant={bgMode === k ? "default" : "outline"} disabled={k === "art" && !bg} onClick={() => setBgMode(k)}>{l}</Button>)}</div></div>
      </div>
      <div><Label>Colors · {palette.label}</Label><div className="mt-2 flex flex-wrap gap-2">{POST_PALETTES.map((p) => <Button key={p.id} size="icon" variant="outline" title={p.label} aria-label={p.label} aria-pressed={paletteId === p.id} onClick={() => setPaletteId(p.id)} className={`h-9 w-9 ${paletteId === p.id ? "border-primary ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}><span className={`h-5 w-5 rounded-full ${p.swatch}`} /></Button>)}</div></div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={footer} onCheckedChange={(v) => setFooter(!!v)} />Proof-point footer (logo moves to the top corner when off)</label>

      {carousel ? deck() : single()}
      {problems.length > 0 && <ul className="list-disc pl-5 text-xs text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <Button size="sm" onClick={save} disabled={!!busy}><LayoutTemplate className="mr-1 h-4 w-4" />{busy === "save" ? "Saving…" : carousel ? `Add ${total} slides to post` : "Add to post"}</Button>
    </div>
  );
}
