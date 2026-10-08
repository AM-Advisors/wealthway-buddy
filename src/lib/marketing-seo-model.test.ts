import { describe, expect, it } from "vitest";
import { buildArticleSchema, canonicalFor, classifyClaim, clustersFor, linkIssues, recommendLinks, seoQuality, structureIssues, titleSimilarity, validateSchema, SERVICE_PAGES } from "./marketing-seo-model";
import { approvalGaps } from "./marketing-content-model";

const SEC = "https://www.sec.gov/rules/final/2026/x.pdf", FORMD = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=D", PR = "https://www.businesswire.com/news/acme", WSJ = "https://www.reuters.com/acme";
const allowed = [SEC, FORMD, PR, WSJ];
describe("claim classification", () => {
  it("Form D amounts are issuer-reported, not verified proceeds", () => {
    const c = classifyClaim({ text: "Fund sold $40M", kind: "primary_fact", source_url: FORMD }, allowed);
    expect(c.kind).toBe("reported"); expect(c.attribution).toMatch(/Issuer-reported/);
  });
  it("press releases are attributed to the publisher unless corroborated", () => {
    expect(classifyClaim({ text: "Acme raised", kind: "primary_fact", source_url: PR }, allowed).kind).toBe("reported");
    expect(classifyClaim({ text: "Acme raised", kind: "corroborated", source_url: PR, corroborating_url: WSJ }, allowed).kind).toBe("corroborated");
    expect(classifyClaim({ text: "Acme raised", kind: "corroborated", source_url: PR, corroborating_url: PR }, allowed).kind).toBe("reported");
  });
  it("unsourced factual assertions become unverified; regulator text stays primary", () => {
    expect(classifyClaim({ text: "x", kind: "regulatory_text", source_url: "https://blog.example" }, allowed).verification).toBe("unverified");
    expect(classifyClaim({ text: "x", kind: "primary_fact", source_url: SEC }, allowed).kind).toBe("primary_fact");
    expect(classifyClaim({ text: "x", kind: "regulatory_interpretation", source_url: SEC }, allowed).note).toMatch(/compliance/);
  });
});
describe("schema and metadata", () => {
  const body = "<h2>What is Form D?</h2><p>Form D is a notice.</p>";
  it("uses the canonical host and only adds FAQPage when questions are visible", () => {
    const j = buildArticleSchema({ slug: "form-d", title: "Form D", description: "d", author: "Harmonious", authorIsPerson: false, published: null, modified: "2026-10-08", faq: [{ q: "What is Form D?", a: "A notice." }], bodyHtml: body });
    expect(j).toContain(canonicalFor("form-d")); expect(j).toContain("FAQPage");
    expect(validateSchema(j, { title: "Form D", description: "d", slug: "form-d", faq: [{ q: "What is Form D?" }], bodyHtml: body })).toEqual([]);
    const hidden = buildArticleSchema({ slug: "form-d", title: "Form D", description: "d", author: "H", authorIsPerson: false, published: null, modified: "x", faq: [{ q: "Hidden question here?", a: "a" }], bodyHtml: body });
    expect(hidden).not.toContain("FAQPage");
    expect(validateSchema(j, { title: "Other", description: "d", slug: "other", faq: [], bodyHtml: body }).length).toBeGreaterThan(0);
  });
  it("flags body H1s and skipped levels", () => {
    expect(structureIssues("<h1>x</h1><h2>Section</h2>")[0]).toMatch(/H1/);
    expect(structureIssues("<h2>Alpha</h2><h4>Delta</h4>").join()).toMatch(/skips/);
  });
});
describe("internal links, clusters and duplicates", () => {
  const pages = [...SERVICE_PAGES, { url: canonicalFor("draft"), title: "SPV draft", kind: "article" as const, published: false }];
  it("never recommends unpublished pages and flags broken/duplicate/exact-match anchors", () => {
    expect(recommendLinks("spv special purpose vehicle syndicate", [], pages, "").map((p) => p.url)).not.toContain(canonicalFor("draft"));
    const issues = linkIssues([{ label: "spv", url: canonicalFor("draft") }, { label: "spv", url: SERVICE_PAGES[1]!.url }, { label: "x", url: "https://nope" }, { label: "spv", url: SERVICE_PAGES[1]!.url }], pages, "", "spv");
    expect(issues.join("|")).toMatch(/unpublished/); expect(issues.join("|")).toMatch(/Broken/); expect(issues.join("|")).toMatch(/Duplicate/); expect(issues.join("|")).toMatch(/exact primary keyword/);
  });
  it("maps topics to clusters and detects near-duplicate titles", () => {
    expect(clustersFor("Understanding 506(c) and Form D filings")).toEqual(expect.arrayContaining(["reg_d", "form_d"]));
    expect(titleSimilarity("Understanding 506(b) vs 506(c) Offerings", "506(b) vs 506(c) Offerings Explained")).toBeGreaterThanOrEqual(0.8);
  });
  it("quality panel recommends instead of promising, and flags keyword stuffing", () => {
    const stuffed = "<p>" + "spv ".repeat(200) + "</p>";
    const d = seoQuality({ seo_title: "SPV", meta_title: "", meta_description: "", slug: "spv", primary_keyword: "spv", secondary_keywords: [], search_intent: "", body_html: stuffed, faq: [], internal_links: [], citations: [] }, { linkIssues: [], schemaIssues: [], duplicateTitles: [], canonicalLive: false });
    expect(d.find((x) => x.key === "useful")!.recs.join()).toMatch(/repeated too often/);
    expect(JSON.stringify(d)).not.toMatch(/guarantee/i);
  });
  it("material edits create a new version that needs fresh reviews", () => {
    const r = ["source_verification", "fact_check", "compliance", "originality"].map((k) => ({ kind: k, result: "pass", package_version: 1, created_at: "2026-10-08" }));
    expect(approvalGaps("market_monday", 1, r)).toEqual([]);
    expect(approvalGaps("market_monday", 2, r).length).toBe(4);
  });
});
