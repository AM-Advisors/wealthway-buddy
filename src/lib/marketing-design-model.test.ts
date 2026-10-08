import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND_KIT, DESIGN_FORMATS, TEMPLATES, brandKitProblems, buildTemplate, changeKind, chartProblems, designProblems,
  resizeDesign, safeMargin, switchTemplate, type ChartLayer, type TextLayer,
} from "./marketing-design-model";
import { classifyClaim, independentSources, articleUrls } from "./marketing-seo-model";

const kit = DEFAULT_BRAND_KIT;

describe("Design Studio C1/C2 (simulated)", () => {
  it("default Brand Kit is valid and rejects invented logos and bad colors", () => {
    expect(brandKitProblems(kit)).toEqual([]);
    expect(brandKitProblems({ ...kit, logos: [...kit.logos, { key: "new", label: "x", variant: "navy", kind: "icon" }] }).length).toBe(1);
    expect(brandKitProblems({ ...kit, colors: kit.colors.map((c) => ({ ...c, hex: "blue" })) }).length).toBeGreaterThan(0);
  });
  it("every template builds a clean, single-logo design in every format", () => {
    for (const t of TEMPLATES) for (const f of Object.keys(DESIGN_FORMATS) as any[]) {
      const d = buildTemplate(t.key, f, kit, { headline: "506(b) vs. 506(c)", publisher: "sec.gov", source_url: "https://www.sec.gov/x" });
      const logos = d.pages[0]!.layers.filter((l) => l.type === "image" && l.logo).length;
      expect(logos).toBeLessThanOrEqual(1);
      expect(designProblems(d).filter((p) => !p.includes("Chart") && !p.includes("chart") && !p.includes("figure") && !p.includes("source"))).toEqual([]);
    }
  });
  it("resize keeps text inside the safe area without stretching", () => {
    const d = buildTemplate("thesis_statement", "li_square", kit, { headline: "A bold thesis" });
    for (const f of ["story", "landscape", "article"] as const) {
      const r = resizeDesign(d, f), m = safeMargin(f), { w, h } = DESIGN_FORMATS[f];
      for (const l of r.pages[0]!.layers.filter((x) => x.type === "text")) {
        expect(l.x).toBeGreaterThanOrEqual(m); expect(l.y).toBeGreaterThanOrEqual(m);
        expect(l.x + l.w).toBeLessThanOrEqual(w - m); expect(l.y + l.h).toBeLessThanOrEqual(h - m);
      }
      const logo0 = d.pages[0]!.layers.find((l) => l.type === "image")!, logo1 = r.pages[0]!.layers.find((l) => l.type === "image")!;
      expect(logo1.w / logo1.h).toBeCloseTo(logo0.w / logo0.h, 1);
    }
  });
  it("material vs decorative changes", () => {
    const d = buildTemplate("market_headline", "li_square", kit, { headline: "H" });
    const moved = structuredClone(d); moved.pages[0]!.layers[1]!.x += 40;
    expect(changeKind(d, moved)).toBe("decorative");
    const re = structuredClone(d); (re.pages[0]!.layers.find((l) => l.type === "text") as TextLayer).text = "Different";
    expect(changeKind(d, re)).toBe("material");
    const ch = structuredClone(d); (ch.pages[0]!.layers.find((l) => l.type === "chart") as ChartLayer).data[0]!.value = 9;
    expect(changeKind(d, ch)).toBe("material");
    expect(changeKind(d, structuredClone(d))).toBe("none");
  });
  it("chart integrity: sources required, Form D stays issuer-reported", () => {
    const c: ChartLayer = { id: "c", type: "chart", chart: "bar", data: [{ label: "Q1", value: 5 }], unit: "", color: "#fff", source_url: "", x: 0, y: 0, w: 10, h: 10 };
    expect(chartProblems(c)).toContain("Quantitative charts need a source link.");
    expect(chartProblems({ ...c, source_url: "https://www.sec.gov/Archives/x" }).some((p) => p.includes("issuer-reported"))).toBe(true);
    expect(chartProblems({ ...c, source_url: "https://www.sec.gov/Archives/x", issuer_reported: true })).toEqual([]);
    expect(chartProblems({ ...c, source_url: "https://a.com", data: [{ label: "", value: NaN }] }).length).toBe(1);
  });
  it("template switch keeps headline and source links; founder quote is flagged", () => {
    const d = buildTemplate("market_headline", "li_square", kit, { headline: "Keep me", claims: [{ text: "Keep me", source_url: "https://sec.gov/a" }] });
    const s = switchTemplate(d, "founder_quote", kit);
    const q = s.pages[0]!.layers.find((l) => l.type === "text" && l.role === "quote") as TextLayer;
    expect(q.text).toContain("Keep me"); expect(q.requires_founder_approval).toBe(true);
  });
});

describe("Stage B corrections (simulated)", () => {
  it("two websites aren't automatically independent", () => {
    expect(independentSources("https://www.prnewswire.com/a", "https://www.reuters.com/b")).toBe(false);
    expect(independentSources("https://news.example.com/a", "https://www.example.com/b")).toBe(false);
    expect(independentSources("https://www.reuters.com/a", "https://www.wsj.com/b", true)).toBe(false);
    expect(independentSources("https://www.reuters.com/a", "https://www.wsj.com/b")).toBe(true);
    const c = classifyClaim({ text: "x", kind: "corroborated", source_url: "https://www.businesswire.com/a", corroborating_url: "https://www.globenewswire.com/b" }, ["https://www.businesswire.com/a", "https://www.globenewswire.com/b"]);
    expect(c.kind).toBe("reported");
  });
  it("keeps live, future canonical and draft preview URLs separate", () => {
    const u = articleUrls("my-post", { liveOnWix: false, previewOrigin: "https://ops.harmonious.co" });
    expect(u.live_publication_url).toBeNull();
    expect(u.intended_canonical_url).toContain("/post/my-post");
    expect(u.draft_preview_indexable).toBe(false);
  });
});
