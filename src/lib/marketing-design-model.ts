/**
 * Design Studio (Stage C1/C2): pure Brand Kit + editable design document rules. Client + server, no I/O.
 * Designs are layer documents (never flattened images) so they stay editable after any template or AI step.
 */
import { BRAND } from "@/lib/marketing-brand";

/* ---------- Formats ---------- */
export const DESIGN_FORMATS = {
  li_square: { label: "LinkedIn square", w: 1080, h: 1080 },
  li_portrait: { label: "LinkedIn portrait", w: 1080, h: 1350 },
  landscape: { label: "Social landscape", w: 1200, h: 627 },
  story: { label: "Story / reel", w: 1080, h: 1920 },
  article: { label: "Article featured image", w: 1600, h: 900 },
} as const;
export type DesignFormat = keyof typeof DESIGN_FORMATS;
export const isFormat = (f: string): f is DesignFormat => f in DESIGN_FORMATS;
/** Safe margin: 80px on 1080 wide (brand rule), scaled to the shorter side. */
export const safeMargin = (f: DesignFormat) => Math.round(Math.min(DESIGN_FORMATS[f].w, DESIGN_FORMATS[f].h) * (80 / 1080));

/* ---------- Brand Kit ---------- */
export type BrandKit = {
  logos: { key: string; label: string; variant: "navy" | "white" | "teal"; kind: "wordmark" | "icon" }[];
  colors: { key: string; label: string; hex: string }[];
  typography: { heading: string; body: string; headingWeight: number; bodyWeight: number };
  styles: Record<string, { label: string; background: string; accent: string; text: string; note: string }>;
  disclaimers: { key: string; text: string }[];
  attribution: { format: string };
  socials: { network: string; handle: string; url: string }[];
  websites: { label: string; url: string }[];
};
const HEX = /^#[0-9a-f]{6}$/i;

/** Default kit is built only from existing Harmonious assets and brand rules — nothing new is invented. */
export const DEFAULT_BRAND_KIT: BrandKit = {
  logos: [
    { key: "wordmark_white", label: "Wordmark (white)", variant: "white", kind: "wordmark" },
    { key: "wordmark_navy", label: "Wordmark (navy)", variant: "navy", kind: "wordmark" },
    { key: "wordmark_teal", label: "Wordmark (teal)", variant: "teal", kind: "wordmark" },
    { key: "icon_white", label: "Lighthouse icon (white)", variant: "white", kind: "icon" },
    { key: "icon_navy", label: "Lighthouse icon (navy)", variant: "navy", kind: "icon" },
    { key: "icon_teal", label: "Lighthouse icon (teal)", variant: "teal", kind: "icon" },
  ],
  colors: [
    { key: "navy", label: "Navy", hex: BRAND.navy }, { key: "midnight", label: "Midnight", hex: BRAND.midnight },
    { key: "cyan", label: "Cyan", hex: BRAND.cyan }, { key: "slate", label: "Soft slate", hex: BRAND.slate },
    { key: "white", label: "White", hex: "#ffffff" }, { key: "ink", label: "Ink", hex: "#221f20" },
  ],
  typography: { heading: "Rubik", body: "Poppins", headingWeight: 700, bodyWeight: 400 },
  styles: {
    market_monday: { label: "Market Monday", background: "navy", accent: "cyan", text: "white", note: "Data-driven headlines, restrained charts, strong contrast." },
    thesis_tuesday: { label: "Thesis Tuesday", background: "midnight", accent: "cyan", text: "white", note: "Bold thesis statements, clean editorial layouts." },
    whatever_wednesday: { label: "Whatever Wednesday", background: "white", accent: "cyan", text: "navy", note: "Light, conversational: polls, questions, community." },
    fund_academy_thursday: { label: "Fund Academy Thursday", background: "slate", accent: "navy", text: "navy", note: "Saveable diagrams, comparisons and explainers." },
    founders_friday: { label: "Founders Friday", background: "ink", accent: "cyan", text: "white", note: "Founder editorial covers; quotations need Alyssa's approval." },
  },
  disclaimers: [{ key: "educational", text: "For educational purposes only. Not investment, legal or tax advice." }],
  attribution: { format: "Source: {publisher}" },
  socials: [
    { network: "Instagram", handle: "@harmoniouscapitaladmin", url: "https://www.instagram.com/harmoniouscapitaladmin" },
    { network: "LinkedIn", handle: "Harmonious", url: "https://www.linkedin.com/company/harmoniouscapitaladmin" },
  ],
  websites: [{ label: "Website", url: "https://www.harmonious.co" }],
};

export function brandKitProblems(k: BrandKit): string[] {
  const out: string[] = [];
  const keys = new Set(DEFAULT_BRAND_KIT.logos.map((l) => l.key));
  if (k.logos.some((l) => !keys.has(l.key))) out.push("Only the approved Harmonious logo files can be used — new logos can't be added here.");
  if (!k.colors.length || k.colors.some((c) => !HEX.test(c.hex))) out.push("Every color needs a 6-digit hex value.");
  const ck = new Set(k.colors.map((c) => c.key));
  for (const [s, st] of Object.entries(k.styles)) for (const f of ["background", "accent", "text"] as const)
    if (!ck.has(st[f])) out.push(`${st.label || s}: "${st[f]}" isn't a Brand Kit color.`);
  if (!k.typography.heading.trim() || !k.typography.body.trim()) out.push("Heading and body fonts are required.");
  if (!k.attribution.format.includes("{publisher}")) out.push("Source attribution must include {publisher}.");
  if (k.websites.some((w) => !/^https:\/\//.test(w.url)) || k.socials.some((s) => !/^https:\/\//.test(s.url))) out.push("Links must start with https://");
  return out;
}
export const BRAND_KIT_EDITORS = ["super_admin", "admin", "marketing_manager"];
export const colorHex = (k: BrandKit, key: string) => k.colors.find((c) => c.key === key)?.hex ?? (HEX.test(key) ? key : "#000000");

/* ---------- Design document ---------- */
type Base = { id: string; x: number; y: number; w: number; h: number; locked?: boolean; hidden?: boolean; name?: string;
  /** Source links: claim texts/urls this layer states. Kept with the design record. */
  claim_refs?: { text: string; source_url: string }[]; requires_founder_approval?: boolean };
export type TextLayer = Base & { type: "text"; text: string; font: "heading" | "body"; size: number; weight: number; color: string; align: "left" | "center" | "right"; role?: "headline" | "body" | "footer" | "attribution" | "cta" | "quote" };
export type ImageLayer = Base & { type: "image"; src: string; fit: "cover" | "contain"; crop: { x: number; y: number; zoom: number }; logo?: boolean };
export type ShapeLayer = Base & { type: "shape"; shape: "rect" | "ellipse" | "line"; fill: string; radius: number; opacity: number };
export type IconLayer = Base & { type: "icon"; icon: string; color: string };
export type ChartPoint = { label: string; value: number };
export type ChartLayer = Base & { type: "chart"; chart: "bar" | "line" | "donut" | "kpi"; data: ChartPoint[]; unit: string; color: string; source_url: string; issuer_reported?: boolean };
export type Layer = TextLayer | ImageLayer | ShapeLayer | IconLayer | ChartLayer;
export type Page = { id: string; background: string; layers: Layer[] };
export type DesignDoc = { format: DesignFormat; series_key: string | null; pages: Page[] };

export const ICONS = ["chart", "shield", "check", "building", "users", "scale", "calendar", "lightbulb", "file", "trend"] as const;
let n = 0;
export const uid = (p = "l") => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Chart data must be finite numbers; quantitative charts need a source; Form D figures stay issuer-reported. */
export function chartProblems(c: ChartLayer): string[] {
  const out: string[] = [];
  if (!c.data.length) out.push("Chart has no data.");
  if (c.data.some((d) => !d.label.trim() || !Number.isFinite(d.value))) out.push("Every chart point needs a label and a number.");
  if (c.chart === "donut" && c.data.some((d) => d.value < 0)) out.push("Donut values can't be negative.");
  if (!c.source_url) out.push("Quantitative charts need a source link.");
  if (/sec\.gov/i.test(c.source_url) && !c.issuer_reported) out.push("Form D amounts must be labelled issuer-reported, not verified fundraising totals.");
  return out;
}

/** Problems that block a design from being sent for review (C5 wires this into approval). */
export function designProblems(d: DesignDoc): string[] {
  const out: string[] = [];
  const m = safeMargin(d.format), { w, h } = DESIGN_FORMATS[d.format];
  d.pages.forEach((p, i) => {
    const logos = p.layers.filter((l) => l.type === "image" && l.logo && !l.hidden).length;
    if (logos > 1) out.push(`Page ${i + 1}: use one logo only.`);
    for (const l of p.layers) {
      if (l.hidden) continue;
      if (l.type === "text" && (l.x < m - 1 || l.y < m - 1 || l.x + l.w > w - m + 1 || l.y + l.h > h - m + 1)) out.push(`Page ${i + 1}: "${(l.text || "").slice(0, 30)}" sits outside the safe margin.`);
      if (l.type === "chart") for (const pr of chartProblems(l)) out.push(`Page ${i + 1}: ${pr}`);
      if (l.type === "text" && l.size < Math.round(w * 0.026)) out.push(`Page ${i + 1}: text "${l.text.slice(0, 20)}" may be too small to read on mobile.`);
    }
  });
  return out;
}

/**
 * Re-flow to another format without stretching: every layer keeps its relative position inside the safe area,
 * scales uniformly by the smaller axis ratio (text sizes too), and is kept inside the new safe area.
 */
export function resizeDesign(d: DesignDoc, to: DesignFormat): DesignDoc {
  const A = DESIGN_FORMATS[d.format], B = DESIGN_FORMATS[to], ma = safeMargin(d.format), mb = safeMargin(to);
  const aw = A.w - 2 * ma, ah = A.h - 2 * ma, bw = B.w - 2 * mb, bh = B.h - 2 * mb;
  const s = Math.min(bw / aw, bh / ah);
  const fit = (l: Layer): Layer => {
    const full = l.type === "shape" && l.w >= A.w - 1 && l.h >= A.h - 1; // background panels fill the new canvas
    if (full) return { ...l, x: 0, y: 0, w: B.w, h: B.h };
    const cx = (l.x + l.w / 2 - ma) / aw, cy = (l.y + l.h / 2 - ma) / ah;
    let w = Math.round(l.w * s), hh = Math.round(l.h * s);
    if (l.type === "text") w = Math.min(bw, Math.round(l.w / aw * bw)); // text gets the same share of width, so it wraps instead of shrinking
    let x = Math.round(mb + cx * bw - w / 2), y = Math.round(mb + cy * bh - hh / 2);
    const inSafe = l.type === "text" || (l.type === "image" && l.logo);
    if (inSafe) { x = Math.max(mb, Math.min(x, B.w - mb - w)); y = Math.max(mb, Math.min(y, B.h - mb - hh)); }
    const next: any = { ...l, x, y, w, h: hh };
    if (l.type === "text") next.size = Math.max(Math.round(B.w * 0.026), Math.round(l.size * s));
    return next;
  };
  return { ...d, format: to, pages: d.pages.map((p) => ({ ...p, layers: p.layers.map(fit) })) };
}

/** Material = text, figures, chart data or source attribution changed. Decorative = position, color, size, order only. */
export function changeKind(a: DesignDoc, b: DesignDoc): "none" | "decorative" | "material" {
  const facts = (d: DesignDoc) => JSON.stringify(d.pages.map((p) => p.layers.filter((l) => !l.hidden).map((l) =>
    l.type === "text" ? ["t", l.id, l.text.trim(), l.claim_refs ?? []] : l.type === "chart" ? ["c", l.id, l.chart, l.data, l.unit, l.source_url, !!l.issuer_reported] : l.type === "image" ? ["i", l.id, l.src] : ["x", l.id])));
  if (facts(a) !== facts(b)) return "material";
  return JSON.stringify(a) === JSON.stringify(b) ? "none" : "decorative";
}

/* ---------- Templates (five series families + blank) ---------- */
export type TemplateKey = "blank" | "market_headline" | "thesis_statement" | "wednesday_poll" | "academy_compare" | "founder_quote";
export const TEMPLATES: { key: TemplateKey; label: string; series: string | null }[] = [
  { key: "market_headline", label: "Market Monday — headline + KPI", series: "market_monday" },
  { key: "thesis_statement", label: "Thesis Tuesday — bold statement", series: "thesis_tuesday" },
  { key: "wednesday_poll", label: "Whatever Wednesday — community question", series: "whatever_wednesday" },
  { key: "academy_compare", label: "Fund Academy — side-by-side comparison", series: "fund_academy_thursday" },
  { key: "founder_quote", label: "Founders Friday — editorial cover", series: "founders_friday" },
  { key: "blank", label: "Blank", series: null },
];

export type TemplateInput = { headline?: string; body?: string; publisher?: string; source_url?: string; claims?: { text: string; source_url: string }[] };

export function buildTemplate(key: TemplateKey, format: DesignFormat, kit: BrandKit, input: TemplateInput = {}): DesignDoc {
  const t = TEMPLATES.find((x) => x.key === key) ?? TEMPLATES[TEMPLATES.length - 1]!;
  const st = (t.series && kit.styles[t.series]) || { background: "navy", accent: "cyan", text: "white" };
  const { w, h } = DESIGN_FORMATS[format], m = safeMargin(format), cw = w - 2 * m, u = w / 1080;
  const bg = colorHex(kit, st.background), ac = colorHex(kit, st.accent), tx = colorHex(kit, st.text);
  const darkBg = ["navy", "midnight", "ink"].includes(st.background);
  const T = (o: Partial<TextLayer> & { text: string; y: number; h: number }): TextLayer => ({ id: uid(), type: "text", x: m, w: cw, font: "body", size: Math.round(34 * u), weight: 400, color: tx, align: "left", ...o });
  const layers: Layer[] = [];
  const headline = input.headline?.trim() || (key === "blank" ? "" : "Your headline here");
  const claims = input.claims ?? [];
  const logo: ImageLayer = { id: uid(), type: "image", name: "Logo", logo: true, src: darkBg ? "logo:wordmark_white" : "logo:wordmark_navy", fit: "contain", crop: { x: 0, y: 0, zoom: 1 }, x: m, y: h - m - Math.round(56 * u), w: Math.round(240 * u), h: Math.round(56 * u) };
  const attribution = input.publisher ? T({ role: "attribution", text: kit.attribution.format.replace("{publisher}", input.publisher), y: h - m - Math.round(110 * u), h: Math.round(40 * u), size: Math.round(28 * u), color: tx, ...(input.source_url ? { claim_refs: [{ text: "source", source_url: input.source_url }] } : {}) }) : null;
  if (key === "blank") return { format, series_key: null, pages: [{ id: uid("p"), background: bg, layers: [] }] };
  layers.push({ id: uid(), type: "shape", name: "Accent bar", shape: "rect", fill: ac, radius: 0, opacity: 1, x: m, y: m, w: Math.round(96 * u), h: Math.round(10 * u) });
  if (key === "market_headline") {
    layers.push(T({ role: "headline", text: headline, y: m + Math.round(50 * u), h: Math.round(300 * u), font: "heading", weight: 700, size: Math.round(72 * u), claim_refs: claims.slice(0, 1) }));
    layers.push({ id: uid(), type: "chart", name: "KPI", chart: "kpi", data: [{ label: "Add a sourced figure", value: 0 }], unit: "", color: ac, source_url: input.source_url ?? "", issuer_reported: /sec\.gov/i.test(input.source_url ?? ""), x: m, y: Math.round(h * 0.48), w: cw, h: Math.round(220 * u) });
  } else if (key === "thesis_statement") {
    layers.push(T({ role: "headline", text: headline, y: Math.round(h * 0.25), h: Math.round(h * 0.4), font: "heading", weight: 700, size: Math.round(88 * u) }));
    if (input.body) layers.push(T({ role: "body", text: input.body, y: Math.round(h * 0.68), h: Math.round(120 * u) }));
  } else if (key === "wednesday_poll") {
    layers.push(T({ role: "headline", text: headline, y: m + Math.round(60 * u), h: Math.round(260 * u), font: "heading", weight: 700, size: Math.round(68 * u), align: "center" }));
    ["Option A", "Option B", "Option C"].forEach((o, i) => {
      const y = Math.round(h * 0.45) + i * Math.round(120 * u);
      layers.push({ id: uid(), type: "shape", shape: "rect", fill: colorHex(kit, "slate"), radius: Math.round(20 * u), opacity: 1, x: m, y, w: cw, h: Math.round(96 * u) });
      layers.push(T({ text: o, x: m + Math.round(32 * u), w: cw - Math.round(64 * u), y: y + Math.round(26 * u), h: Math.round(50 * u), color: colorHex(kit, "navy"), weight: 600 }));
    });
  } else if (key === "academy_compare") {
    layers.push(T({ role: "headline", text: headline, y: m + Math.round(40 * u), h: Math.round(200 * u), font: "heading", weight: 700, size: Math.round(64 * u) }));
    const colW = Math.round((cw - 30 * u) / 2);
    [0, 1].forEach((i) => {
      const x = m + i * (colW + Math.round(30 * u)), y = Math.round(h * 0.34);
      layers.push({ id: uid(), type: "shape", shape: "rect", fill: "#ffffff", radius: Math.round(24 * u), opacity: 1, x, y, w: colW, h: Math.round(h * 0.42) });
      layers.push(T({ text: i ? "Option B" : "Option A", x: x + Math.round(28 * u), w: colW - Math.round(56 * u), y: y + Math.round(28 * u), h: Math.round(60 * u), font: "heading", weight: 700, size: Math.round(40 * u), color: colorHex(kit, "navy") }));
      layers.push(T({ text: "Key point", x: x + Math.round(28 * u), w: colW - Math.round(56 * u), y: y + Math.round(110 * u), h: Math.round(h * 0.25), color: colorHex(kit, "ink"), size: Math.round(30 * u) }));
    });
  } else if (key === "founder_quote") {
    layers.push({ id: uid(), type: "icon", icon: "lightbulb", color: ac, x: m, y: m + Math.round(50 * u), w: Math.round(80 * u), h: Math.round(80 * u) });
    layers.push(T({ role: "quote", text: input.headline?.trim() ? `“${headline}”` : "“Quotation approved by Alyssa”", y: Math.round(h * 0.28), h: Math.round(h * 0.38), font: "heading", weight: 600, size: Math.round(64 * u), requires_founder_approval: true }));
    layers.push(T({ role: "body", text: "Alyssa Pettit, Founder & CEO", y: Math.round(h * 0.7), h: Math.round(50 * u), color: ac, weight: 600 }));
  }
  if (attribution) layers.push(attribution);
  layers.push(logo);
  return { format, series_key: t.series, pages: [{ id: uid("p"), background: bg, layers }] };
}

/** Swap template while keeping the user's headline/body text and source links. */
export function switchTemplate(d: DesignDoc, key: TemplateKey, kit: BrandKit): DesignDoc {
  const first = d.pages[0]?.layers ?? [];
  const head = first.find((l): l is TextLayer => l.type === "text" && (l.role === "headline" || l.role === "quote"));
  const body = first.find((l): l is TextLayer => l.type === "text" && l.role === "body");
  const next = buildTemplate(key, d.format, kit, { headline: head?.text.replace(/^“|”$/g, ""), body: body?.text, claims: head?.claim_refs });
  return { ...next, pages: [next.pages[0]!, ...d.pages.slice(1)] };
}
