/**
 * SEO & AI-search rules for Content Studio packages (pure; client + server). No I/O.
 * Nothing here promises indexing, rankings or AI citations, and no keyword volume/difficulty is ever invented.
 */
import { MARKETING_ORIGIN, ORGANIZATION } from "@/lib/marketing/site-config";

export const canonicalFor = (slug: string) => `${MARKETING_ORIGIN}/post/${slug}`;

/* ---------- Claim classes ---------- */
export const CLAIM_CLASSES = [
  "primary_fact", "reported", "corroborated", "regulatory_text", "regulatory_interpretation",
  "analysis", "projection", "hypothetical", "unverified",
] as const;
export type ClaimClass = (typeof CLAIM_CLASSES)[number];
export const CLAIM_CLASS_LABEL: Record<ClaimClass, string> = {
  primary_fact: "Primary-source documented fact", reported: "Third-party reported claim", corroborated: "Independently corroborated fact",
  regulatory_text: "Regulatory text", regulatory_interpretation: "Regulatory interpretation", analysis: "Harmonious analysis or opinion",
  projection: "Projection", hypothetical: "Hypothetical example", unverified: "Unverified claim",
};
/** Classes that are factual assertions and must carry a stored source. */
export const SOURCED_CLASSES: ClaimClass[] = ["primary_fact", "reported", "corroborated", "regulatory_text", "regulatory_interpretation"];
/** Roles allowed to pass compliance review when a package contains regulatory interpretations. */
export const REG_INTERPRETATION_REVIEWERS = ["compliance_reviewer", "executive", "super_admin"];

/** Legacy Stage A kinds map onto the refined classes. */
export function normalizeClass(k: string): ClaimClass {
  if ((CLAIM_CLASSES as readonly string[]).includes(k)) return k as ClaimClass;
  if (k === "fact") return "primary_fact";
  if (k === "opinion") return "analysis";
  return "unverified";
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
export const isFormD = (u: string) => /sec\.gov/.test(host(u)) && /(edgar|cgi-bin|Archives|formd|form-d)/i.test(u);
const REGULATORS = ["sec.gov", "irs.gov", "federalregister.gov", "fincen.gov", "treasury.gov", "ecfr.gov", "finra.org", "nasaa.org"];
export const isRegulator = (u: string) => REGULATORS.some((r) => host(u) === r || host(u).endsWith(`.${r}`));

export type ClassifiedClaim = {
  text: string; kind: ClaimClass; source_url: string; corroborating_url?: string;
  attribution: string; verification: "sourced" | "unverified" | "not_applicable"; note?: string;
};

/**
 * Applies the attribution rules: Form D → issuer-reported; non-regulator sources → attributed to the publisher
 * unless a second independent source corroborates; facts without a stored source become unverified.
 */
export function classifyClaim(c: { text: string; kind: string; source_url?: string; corroborating_url?: string }, allowed: string[]): ClassifiedClaim {
  const src = new Set(allowed);
  let kind = normalizeClass(c.kind);
  const url = c.source_url && src.has(c.source_url) ? c.source_url : "";
  const corr = c.corroborating_url && src.has(c.corroborating_url) && host(c.corroborating_url) !== host(url) ? c.corroborating_url : "";
  const text = c.text.trim();
  if (!SOURCED_CLASSES.includes(kind)) return { text, kind, source_url: url, attribution: kind === "analysis" ? "Harmonious" : "", verification: kind === "unverified" ? "unverified" : "not_applicable" };
  if (!url) return { text, kind: "unverified", source_url: "", attribution: "", verification: "unverified", note: "No stored source — can't pass approval." };
  if (isFormD(url)) return { text, kind: "reported", source_url: url, attribution: "Issuer-reported on SEC Form D", verification: "sourced", note: "Issuer-reported information, not independently verified fundraising proceeds." };
  if (kind === "corroborated" && !corr) kind = isRegulator(url) ? "primary_fact" : "reported";
  if (kind === "primary_fact" && !isRegulator(url)) kind = corr ? "corroborated" : "reported";
  if ((kind === "regulatory_text" || kind === "regulatory_interpretation") && !isRegulator(url) && kind === "regulatory_text") kind = "reported";
  const attribution = kind === "reported" ? `Reported by ${host(url)}` : kind === "corroborated" ? `${host(url)} and ${host(corr)}` : host(url);
  return { text, kind, source_url: url, ...(corr ? { corroborating_url: corr } : {}), attribution, verification: "sourced",
    ...(kind === "regulatory_interpretation" ? { note: "Needs compliance review by an authorized reviewer." } : {}) };
}

/* ---------- Structure ---------- */
export type Heading = { level: number; text: string };
export function headings(html: string): Heading[] {
  return [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: m[2]!.replace(/<[^>]+>/g, "").trim() }));
}
export function structureIssues(html: string): string[] {
  const hs = headings(html), out: string[] = [];
  if (hs.some((h) => h.level === 1)) out.push("Remove H1 tags from the article body — the page title is the only H1.");
  if (!hs.some((h) => h.level === 2)) out.push("Add descriptive H2 sections.");
  let last = 1;
  for (const h of hs) { if (h.level > last + 1) { out.push(`"${h.text.slice(0, 50)}" skips a heading level (H${last} → H${h.level}).`); break; } last = h.level; }
  if (hs.some((h) => h.text.length < 4)) out.push("Some headings are too short to describe their section.");
  return out;
}
const words = (t: string) => t.replace(/<[^>]+>/g, " ").toLowerCase().match(/[a-z0-9]+/g) ?? [];

/* ---------- Schema ---------- */
export type SchemaInput = {
  slug: string; title: string; description: string; author: string; authorIsPerson: boolean;
  published: string | null; modified: string; faq: { q: string; a: string }[]; bodyHtml: string; blog?: boolean;
};
/** FAQPage only when every question is visibly on the page. Organization/WebSite come from the site-wide head, so the article references the publisher by @id instead of duplicating it. */
export function faqVisible(faq: { q: string }[], html: string) {
  const body = words(html).join(" ");
  return faq.length > 0 && faq.every((f) => body.includes(words(f.q).join(" ")));
}
export function buildArticleSchema(i: SchemaInput): string {
  const url = canonicalFor(i.slug), orgId = `${MARKETING_ORIGIN}/#organization`;
  const graph: any[] = [
    {
      "@type": i.blog ? "BlogPosting" : "Article", "@id": `${url}#article`, headline: i.title.slice(0, 110), description: i.description,
      mainEntityOfPage: url, url, author: i.authorIsPerson ? { "@type": "Person", name: i.author } : { "@id": orgId },
      publisher: { "@type": "Organization", "@id": orgId, name: ORGANIZATION.name, url: MARKETING_ORIGIN },
      ...(i.published ? { datePublished: i.published } : {}), dateModified: i.modified,
    },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${MARKETING_ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Resources", item: `${MARKETING_ORIGIN}/harmoniousclassroom` },
      { "@type": "ListItem", position: 3, name: i.title, item: url }] },
  ];
  if (faqVisible(i.faq, i.bodyHtml)) graph.push({ "@type": "FAQPage", mainEntity: i.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}
/** Required properties present and values match what the page shows. */
export function validateSchema(json: string, visible: { title: string; description: string; slug: string; faq: { q: string }[]; bodyHtml: string }): string[] {
  let d: any; try { d = JSON.parse(json); } catch { return ["Structured data isn't valid JSON."]; }
  const g: any[] = d["@graph"] ?? [d], out: string[] = [];
  const art = g.find((x) => x["@type"] === "Article" || x["@type"] === "BlogPosting");
  if (!art) out.push("Missing Article/BlogPosting.");
  else {
    for (const k of ["headline", "author", "publisher", "dateModified", "mainEntityOfPage"]) if (!art[k]) out.push(`Article is missing ${k}.`);
    if (art.headline !== visible.title.slice(0, 110)) out.push("Article headline doesn't match the visible title.");
    if (art.mainEntityOfPage !== canonicalFor(visible.slug)) out.push("Article URL doesn't match the canonical URL.");
  }
  const faq = g.find((x) => x["@type"] === "FAQPage");
  if (faq && !faqVisible(visible.faq, visible.bodyHtml)) out.push("FAQ markup includes questions that aren't visible in the article.");
  if (g.filter((x) => x["@type"] === "Organization" && !x["@id"]).length) out.push("Organization should reference the site-wide #organization, not duplicate it.");
  return out;
}

/* ---------- Internal links ---------- */
export type SitePage = { url: string; title: string; kind: "article" | "service" | "academy"; published: boolean; keywords?: string[] };
export const SERVICE_PAGES: SitePage[] = [
  { url: `${MARKETING_ORIGIN}/fund-administration`, title: "Fund administration", kind: "service", published: true, keywords: ["fund", "administration", "nav", "accounting", "k-1", "capital", "lp"] },
  { url: `${MARKETING_ORIGIN}/spvs`, title: "SPV administration", kind: "service", published: true, keywords: ["spv", "special", "purpose", "vehicle", "syndicate"] },
  { url: `${MARKETING_ORIGIN}/platform`, title: "Harmonious platform", kind: "service", published: true, keywords: ["platform", "onboarding", "kyc", "cap", "table", "investor", "portal"] },
  { url: `${MARKETING_ORIGIN}/data-security`, title: "Data security", kind: "service", published: true, keywords: ["security", "privacy", "soc", "data"] },
];
/** Ranks published pages by topical overlap with the article; never suggests unpublished pages. */
export function recommendLinks(text: string, keywords: string[], pages: SitePage[], selfUrl: string, max = 5) {
  const w = new Set([...words(text), ...keywords.flatMap((k) => words(k))]);
  return pages.filter((p) => p.published && p.url !== selfUrl).map((p) => {
    const terms = [...new Set([...words(p.title), ...(p.keywords ?? [])])].filter((t) => t.length > 2);
    const hits = terms.filter((t) => w.has(t));
    return { ...p, score: terms.length ? hits.length / terms.length : 0, reason: hits.slice(0, 4).join(", ") };
  }).filter((p) => p.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, max);
}
export function linkIssues(links: { label: string; url: string }[], pages: SitePage[], selfUrl: string, primaryKeyword: string): string[] {
  const out: string[] = [], known = new Map(pages.map((p) => [p.url, p]));
  const seen = new Set<string>();
  for (const l of links) {
    const p = known.get(l.url);
    if (!p) out.push(`Broken or unknown link: ${l.url}`);
    else if (!p.published) out.push(`Links to unpublished content: ${l.url}`);
    if (l.url === selfUrl) out.push("Article links to itself.");
    if (seen.has(l.url)) out.push(`Duplicate link to ${l.url}`); seen.add(l.url);
  }
  const exact = primaryKeyword.trim() ? links.filter((l) => l.label.trim().toLowerCase() === primaryKeyword.trim().toLowerCase()).length : 0;
  if (exact > 1) out.push(`${exact} links use the exact primary keyword as anchor text — vary them.`);
  return out;
}

/* ---------- Topic clusters ---------- */
export const CLUSTERS = [
  { key: "fund_admin", label: "Fund administration", terms: ["fund administration", "fund admin", "administrator", "capital call", "distribution"] },
  { key: "spv", label: "SPV administration", terms: ["spv", "special purpose vehicle", "syndicate", "series llc", "master series"] },
  { key: "cap_table", label: "Cap table management", terms: ["cap table", "chain of title", "equity", "dilution"] },
  { key: "onboarding", label: "Investor onboarding", terms: ["onboarding", "subscription", "investor portal", "subscription document"] },
  { key: "kyc", label: "KYC/KYB/AML", terms: ["kyc", "kyb", "aml", "beneficial ownership", "boi", "fincen"] },
  { key: "accredited", label: "Accredited investor verification", terms: ["accredited investor", "accreditation", "verification"] },
  { key: "reg_d", label: "Rule 506(b) and 506(c)", terms: ["506(b)", "506(c)", "506 b", "506 c", "regulation d", "general solicitation"] },
  { key: "form_d", label: "Form D and Blue Sky filings", terms: ["form d", "blue sky", "nasaa", "state filing"] },
  { key: "nav", label: "Fund accounting and NAV", terms: ["nav", "net asset value", "fund accounting", "valuation", "audit"] },
  { key: "tax", label: "K-1s and partnership taxes", terms: ["k-1", "k1", "partnership tax", "1065", "tax"] },
  { key: "fundraising", label: "Startup fundraising and dilution", terms: ["fundraising", "raise", "pitch", "seed", "dilution", "investors"] },
  { key: "secondaries", label: "Private-market liquidity and secondaries", terms: ["secondary", "secondaries", "liquidity", "tender"] },
] as const;
export function clustersFor(text: string): string[] {
  const t = ` ${text.toLowerCase()} `;
  return CLUSTERS.filter((c) => c.terms.some((x) => t.includes(x))).map((c) => c.key);
}

/* ---------- Duplicate detection ---------- */
export function titleSimilarity(a: string, b: string) {
  const A = new Set(words(a).filter((x) => x.length > 3)), B = new Set(words(b).filter((x) => x.length > 3));
  if (!A.size || !B.size) return 0;
  return [...A].filter((x) => B.has(x)).length / Math.min(A.size, B.size);
}

/* ---------- Quality panel ---------- */
export type SeoPkg = {
  seo_title: string; meta_title: string; meta_description: string; slug: string; primary_keyword: string; secondary_keywords: string[];
  search_intent: string; body_html: string; faq: { q: string; a: string }[]; internal_links: { label: string; url: string }[];
  citations: { url: string }[]; h1?: string; opening_answer?: string; related_questions?: string[]; audience?: string; topic_cluster?: string;
  claims?: { kind: string; verification?: string }[];
};
export type Dimension = { key: string; label: string; score: number; recs: string[] };
/** Editorial self-check only. A high score is not proof of accuracy and doesn't guarantee rankings, clicks or AI citations. */
export function seoQuality(p: SeoPkg, ctx: { linkIssues: string[]; schemaIssues: string[]; duplicateTitles: string[]; canonicalLive: boolean }): Dimension[] {
  const body = p.body_html, txt = words(body), firstPara = (body.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "").replace(/<[^>]+>/g, "");
  const dim = (key: string, label: string, checks: [boolean, string][]): Dimension => ({
    key, label, score: Math.round((checks.filter((c) => c[0]).length / checks.length) * 100), recs: checks.filter((c) => !c[0]).map((c) => c[1]) });
  const kw = p.primary_keyword.toLowerCase().trim();
  const kwCount = kw ? (txt.join(" ").match(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length : 0;
  const density = txt.length ? (kwCount * Math.max(1, kw.split(" ").length)) / txt.length : 0;
  const claims = p.claims ?? [];
  const facts = claims.filter((c) => SOURCED_CLASSES.includes(normalizeClass(c.kind)) || c.kind === "unverified");
  const hs = headings(body);
  return [
    dim("intent", "Search intent alignment", [[!!p.search_intent.trim(), "State the search intent (informational, commercial, navigational)."], [!!kw, "Set a primary keyword."], [!kw || p.seo_title.toLowerCase().includes(kw.split(" ")[0]!), "Reflect the main topic in the SEO title."], [!!(p.audience ?? "").trim(), "Name the target audience."]]),
    dim("useful", "Content usefulness", [[txt.length >= 600, "Article is short — answer the question fully (600+ words)."], [/<(ol|ul|table)/i.test(body), "Add a list, steps or a comparison table where it helps."], [/example/i.test(body), "Add a practical example (label hypothetical ones)."], [density < 0.03, "Primary keyword is repeated too often — write naturally."]]),
    dim("sources", "Source quality", [[p.citations.length >= 1, "Cite at least one primary source."], [p.citations.some((c) => isRegulator(c.url)), "Prefer a regulator or primary document where one exists."]]),
    dim("facts", "Factual support", [[facts.every((c) => c.verification !== "unverified" && c.kind !== "unverified"), "Source or remove every unverified claim."], [claims.length > 0, "List the claims the article relies on."]]),
    dim("structure", "Structural clarity", [[structureIssues(body).length === 0, structureIssues(body)[0] ?? ""], [firstPara.length >= 80 || !!(p.opening_answer ?? "").trim(), "Open with a direct 1–2 sentence answer."], [hs.filter((h) => h.level === 2).length >= 3, "Use at least three descriptive H2 sections."], [/<(dfn|strong)>[^<]{2,60}<\/(dfn|strong)>\s*(is|means|refers)/i.test(body) || /\bis defined as\b|\bmeans\b/i.test(body), "Define key terms plainly."]]),
    dim("links", "Internal linking", [[p.internal_links.length >= 2, "Add 2–5 relevant internal links."], [ctx.linkIssues.length === 0, ctx.linkIssues[0] ?? ""]]),
    dim("meta", "Metadata completeness", [[p.meta_title.length > 20 && p.meta_title.length <= 60, "Meta title should be 20–60 characters."], [p.meta_description.length >= 70 && p.meta_description.length <= 155, "Meta description should be 70–155 characters."], [/^[a-z0-9-]{3,80}$/.test(p.slug), "Use a short lowercase-hyphen slug."], [ctx.duplicateTitles.length === 0, `Title is close to existing content: ${ctx.duplicateTitles[0] ?? ""}`]]),
    dim("technical", "Technical SEO readiness", [[ctx.schemaIssues.length === 0, ctx.schemaIssues[0] ?? ""], [!/<script|style=/i.test(body), "Remove scripts or inline styles from the article HTML."], [ctx.canonicalLive, "Canonical host www.harmonious.co isn't serving this site yet — confirm before publishing."]]),
    dim("ai", "AI-answer readability", [[hs.filter((h) => /\?$/.test(h.text)).length >= 2, "Phrase some headings as the questions readers ask."], [p.faq.length >= 3 || (p.related_questions ?? []).length >= 3, "Answer 3+ related questions."], [/Harmonious/.test(body), "Name entities clearly (e.g. Harmonious, SEC, IRS) instead of 'we' or 'they'."]]),
  ].map((d) => ({ ...d, recs: d.recs.filter(Boolean) }));
}
