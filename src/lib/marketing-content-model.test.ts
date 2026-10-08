import { describe, expect, it } from "vitest";
import { approvalGaps, buildSchema, overlapPercent, rankingClaims, sanitizePackage, type ContentPackage } from "./marketing-content-model";

const base: ContentPackage = {
  seo_title: "T", social_headline: "S", slug: "Hello World!", meta_title: "M", meta_description: "D", primary_keyword: "k", secondary_keywords: [], search_intent: "i",
  outline: [], body_html: "<p>x</p>", faq: [], internal_links: [{ label: "a", url: "https://harmonious.co/spvs" }, { label: "b", url: "https://harmonious.co/fake" }],
  citations: [{ label: "SEC", url: "https://sec.gov/a" }, { label: "made up", url: "https://x.com/z" }], schema_jsonld: "", cta: "",
  social: { linkedin_company: "", linkedin_executive: "", facebook: "", instagram: "", x: "", email_subject: "", email_body: "" },
  graphics: [{ template: "stat", size: "square", headline: "", subhead: "", stat: "$4.2 billion", stat_source_url: "https://sec.gov/a", bullets: [] },
    { template: "stat", size: "square", headline: "", subhead: "", stat: "73%", stat_source_url: "https://sec.gov/a", bullets: [] }],
};

describe("content package rules", () => {
  it("keeps only stored sources, real internal pages and verified statistics", () => {
    const r = sanitizePackage(base, ["https://sec.gov/a"], ["https://harmonious.co/spvs"], "The SEC reported $4.2 billion in penalties.");
    expect(r.citations.map((c) => c.url)).toEqual(["https://sec.gov/a"]);
    expect(r.internal_links).toHaveLength(1);
    expect(r.graphics[0]!.stat).toBe("$4.2 billion");
    expect(r.graphics[1]!.stat).toBe("");
    expect(r.checks!.unverified_stats).toBe(1);
    expect(r.slug).toBe("hello-world");
  });
  it("flags ranking guarantees", () => { expect(rankingClaims("We guarantee to rank #1 on Google")).not.toHaveLength(0); });
  it("structured data includes FAQ only when the page shows one", () => {
    expect(buildSchema({ ...base, faq: [] }, "u", "Harmonious", null, "2026-01-01")).not.toContain("FAQPage");
    expect(buildSchema({ ...base, faq: [{ q: "q", a: "a" }] }, "u", "Harmonious", null, "2026-01-01")).toContain("FAQPage");
  });
  it("needs every review on the current version, plus Alyssa for Founders Friday", () => {
    const pass = (kind: string, v = 2) => ({ kind, result: "pass", package_version: v, created_at: "2026-01-01" });
    const all = ["source_verification", "fact_check", "compliance", "originality"].map((k) => pass(k));
    expect(approvalGaps("market_monday", 2, all)).toEqual([]);
    expect(approvalGaps("market_monday", 3, all)).toHaveLength(4);
    expect(approvalGaps("founders_friday", 2, all)).toHaveLength(1);
    expect(approvalGaps("founders_friday", 2, [...all, pass("founder_review")])).toEqual([]);
    expect(approvalGaps("market_monday", 0, [])).toHaveLength(1);
  });
  it("measures copied phrasing", () => {
    const t = "one two three four five six seven eight nine ten eleven twelve";
    expect(overlapPercent(t, t)).toBe(100);
    expect(overlapPercent(t, "unrelated")).toBe(0);
  });
});

import { checkPackageClaims, seriesTemplate, unsourcedQuotes, sanitizePackage as sp2 } from "./marketing-content-model";
describe("Phase 3 Stage A claims", () => {
  it("keeps fact sources, flags unsourced facts, never needs sources for analysis", () => {
    const r = checkPackageClaims([
      { text: "SEC adopted rule X", kind: "fact", source_url: "https://sec.gov/a" },
      { text: "Volume doubled", kind: "fact", source_url: "https://made-up.com" },
      { text: "Managers should prepare", kind: "analysis", source_url: "" },
    ], ["https://sec.gov/a"]);
    expect(r.unverified).toBe(1);
    expect(r.claims[1]!.source_url).toBe("");
    expect(r.claims[2]!.verification).toBe("not_applicable");
  });
  it("flags quotations that aren't in the sources", () => {
    expect(unsourcedQuotes("<p>He said “we will triple fund launches next year”.</p>", "nothing like that")).toHaveLength(1);
    expect(unsourcedQuotes("<p>The rule says “issuers must file within fifteen days”.</p>", "Issuers must file within fifteen days of first sale")).toHaveLength(0);
  });
  it("has a distinct template per series and Founders Friday stays a proposed draft", () => {
    const keys = ["market_monday", "thesis_tuesday", "whatever_wednesday", "fund_academy_thursday", "founders_friday"];
    expect(new Set(keys.map((k) => seriesTemplate(k).summary)).size).toBe(5);
    expect(seriesTemplate("founders_friday").rules.join(" ")).toMatch(/PROPOSED/);
  });
  it("sanitize counts unverified facts so approval stays blocked", () => {
    const base: any = { seo_title: "t", social_headline: "", slug: "t", meta_title: "", meta_description: "", primary_keyword: "", secondary_keywords: [], search_intent: "", outline: [], body_html: "<p>x</p>", faq: [], internal_links: [], citations: [], schema_jsonld: "", cta: "", social: { linkedin_company: "", linkedin_executive: "", facebook: "", instagram: "", x: "", email_subject: "", email_body: "" }, graphics: [],
      claims: [{ text: "A fact", kind: "fact", source_url: "https://nope" }] };
    expect(sp2(base, ["https://sec.gov/a"], [], "").checks!.unverified_facts).toBe(1);
  });
});
