/** Marketing content workspace: pure package rules (client + server). No I/O. */
export const REVIEW_KINDS = ["source_verification", "fact_check", "compliance", "originality", "founder_review"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_LABEL: Record<ReviewKind, string> = {
  source_verification: "Source verification", fact_check: "Fact check", compliance: "Compliance review",
  originality: "Originality review", founder_review: "Alyssa's review (Founders Friday)",
};
/** Founders Friday review may only be recorded by the CEO role. */
export const FOUNDER_REVIEW_ROLE = "executive";

export const GRAPHIC_TEMPLATES = [
  { key: "breaking", label: "Breaking market news", style: "statement" },
  { key: "regulatory", label: "SEC & regulatory update", style: "cards" },
  { key: "stat", label: "Data & statistics", style: "stat" },
  { key: "quote", label: "Founder quotation", style: "quote" },
  { key: "carousel", label: "Educational carousel", style: "carousel" },
  { key: "comparison", label: "Comparison chart", style: "checklist" },
  { key: "academy", label: "Academy explainer", style: "cards" },
  { key: "poll", label: "Community poll", style: "statement" },
] as const;
export const GRAPHIC_SIZES = [
  { key: "square", label: "1080 × 1080 square" }, { key: "portrait", label: "1080 × 1350 portrait" },
  { key: "landscape", label: "1200 × 627 landscape" }, { key: "story", label: "1080 × 1920 story" },
] as const;
export const SOCIAL_CHANNELS = [
  { key: "linkedin_company", label: "LinkedIn company page" }, { key: "linkedin_executive", label: "LinkedIn executive profile" },
  { key: "facebook", label: "Facebook" }, { key: "instagram", label: "Instagram" }, { key: "x", label: "X" },
  { key: "email", label: "Email newsletter" },
] as const;

export type Graphic = { template: string; size: string; headline: string; subhead: string; stat: string; stat_source_url: string; bullets: string[]; stat_unverified?: boolean };
export type ContentPackage = {
  seo_title: string; social_headline: string; slug: string; meta_title: string; meta_description: string;
  primary_keyword: string; secondary_keywords: string[]; search_intent: string;
  outline: { heading: string; points: string[] }[]; body_html: string; faq: { q: string; a: string }[];
  internal_links: { label: string; url: string }[]; citations: { label: string; url: string }[];
  schema_jsonld: string; cta: string;
  social: Record<"linkedin_company" | "linkedin_executive" | "facebook" | "instagram" | "x" | "email_subject" | "email_body", string>;
  graphics: Graphic[];
  /** Every statement the package relies on, labelled by kind. Facts keep their source reference. */
  claims?: PackageClaim[];
  /** Alternative calls to action for the editor to choose from. */
  cta_options?: string[];
  /** SEO & AI search fields (Stage B). Editors may override every suggestion. */
  h1?: string; opening_answer?: string; related_questions?: string[]; audience?: string; topic_cluster?: string;
  pillar_page?: string; supporting_articles?: string[]; service_pages?: string[]; last_reviewed_at?: string | null;
  checks?: { dropped_citations: string[]; dropped_links: string[]; unverified_stats: number; ranking_claims: string[]; unverified_facts?: number; unsourced_quotes?: string[] };
};

import { CLAIM_CLASSES, CLAIM_CLASS_LABEL, classifyClaim, type ClaimClass } from "@/lib/marketing-seo-model";
export const CLAIM_KINDS = CLAIM_CLASSES;
export type ClaimKind = ClaimClass;
export const CLAIM_LABEL = CLAIM_CLASS_LABEL;
export type PackageClaim = { text: string; kind: string; source_url: string; corroborating_url?: string; attribution?: string; note?: string; verification?: "sourced" | "unverified" | "not_applicable" };

/** Generation template per editorial series. Server builds the prompt from these; editors see the summary. */
export const SERIES_TEMPLATES: Record<string, { summary: string; rules: string[] }> = {
  market_monday: { summary: "Timely news analysis: verified facts, market implications, one clear takeaway.", rules: [
    "Open with what happened, stated only from the source material, with its original publication date.",
    "Then 'What it means' as clearly labelled analysis for fund managers and LPs.", "End with one practical takeaway."] },
  thesis_tuesday: { summary: "Evidence-based Harmonious perspective on private-market infrastructure, technology and operations.", rules: [
    "State the thesis as Harmonious analysis, not fact.", "Support it only with sourced facts; mark reasoning as analysis and any forecast as projection.",
    "Acknowledge one counterpoint or limitation."] },
  whatever_wednesday: { summary: "Engagement: polls, team stories, relatable observations.", rules: [
    "Light, human tone. Include one poll question with 3–4 options in the social captions.",
    "Never invent team members, anecdotes or client stories; use [TEAM STORY TO ADD] placeholders.", "Any factual hook must come from the sources."] },
  fund_academy_thursday: { summary: "Evergreen education grounded in authoritative regulatory and tax sources.", rules: [
    "Explain step by step with plain definitions.", "Cite the regulator or statute for every requirement; never state a requirement the sources don't contain.",
    "Include a short 'This is general education, not legal or tax advice' line."] },
  founders_friday: { summary: "Proposed first-person draft for Alyssa Pettit, grounded in public news — not her statement until she approves.", rules: [
    "This is a PROPOSED draft for Alyssa, never an authenticated statement.",
    "Never invent Alyssa's experiences, opinions, quotes or stories; write [ALYSSA TO ADD: …] placeholders and framing questions where her view belongs.",
    "Public facts must come from the sources."] },
};
export const seriesTemplate = (key: string) => SERIES_TEMPLATES[key] ?? { summary: "General Harmonious content.", rules: [] };

/** Quoted passages (≥ 20 chars) that don't appear in the source text — possible invented quotations. */
export function unsourcedQuotes(html: string, sourceText: string): string[] {
  const text = html.replace(/<[^>]+>/g, " ");
  const src = norm(sourceText);
  const out: string[] = [];
  for (const m of text.matchAll(/[“"]([^”"]{20,400})[”"]/g)) if (!src.includes(norm(m[1]!))) out.push(m[1]!.trim());
  return out;
}
/** Facts must point at one of the item's stored sources; anything else is unverified and blocks approval. Attribution rules live in classifyClaim. */
export function checkPackageClaims(claims: PackageClaim[], allowedSources: string[]): { claims: PackageClaim[]; unverified: number } {
  const out = claims.filter((c) => c.text?.trim()).map((c) => classifyClaim(c, allowedSources) as PackageClaim);
  return { claims: out, unverified: out.filter((c) => c.verification === "unverified").length };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.%$]+/g, " ").trim();
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

/** Phrases that promise rankings or AI citations — never allowed. */
const RANKING = [/guarantee[ds]? (?:to )?rank/i, /#1 on google/i, /rank (?:first|#1|number one)/i, /guaranteed (?:seo|traffic|citations?)/i, /will be cited by (?:ai|chatgpt)/i];
export function rankingClaims(text: string): string[] {
  return RANKING.map((r) => text.match(r)?.[0]).filter(Boolean) as string[];
}

/** Keep only citations whose URL is one of the item's stored sources; internal links only from known pages. */
export function sanitizePackage(p: ContentPackage, allowedSources: string[], allowedInternal: string[], factText: string): ContentPackage {
  const src = new Set(allowedSources), internal = new Set(allowedInternal);
  const dropped_citations = p.citations.filter((c) => !src.has(c.url)).map((c) => c.url);
  const dropped_links = p.internal_links.filter((l) => !internal.has(l.url)).map((l) => l.url);
  const facts = norm(factText);
  let unverified = 0;
  const graphics = p.graphics.map((g) => {
    const ok = !g.stat.trim() || (facts.includes(norm(g.stat)) && src.has(g.stat_source_url));
    if (!ok) unverified++;
    return { ...g, stat: ok ? g.stat : "", stat_source_url: ok ? g.stat_source_url : "", stat_unverified: !ok };
  });
  const all = [p.seo_title, p.meta_description, p.body_html, ...Object.values(p.social)].join(" ");
  const cl = checkPackageClaims(p.claims ?? [], allowedSources);
  return {
    ...p, slug: slugify(p.slug || p.seo_title),
    citations: p.citations.filter((c) => src.has(c.url)),
    internal_links: p.internal_links.filter((l) => internal.has(l.url)),
    graphics, claims: cl.claims, cta_options: (p.cta_options ?? []).filter((x) => x?.trim()).slice(0, 5),
    checks: { dropped_citations, dropped_links, unverified_stats: unverified, ranking_claims: rankingClaims(all), unverified_facts: cl.unverified, unsourced_quotes: unsourcedQuotes(p.body_html, factText) },
  };
}

/** Structured data built only from what the page visibly shows. */
export function buildSchema(p: Pick<ContentPackage, "seo_title" | "meta_description" | "faq">, url: string, author: string, published: string | null, modified: string): string {
  const graph: any[] = [{
    "@type": "Article", headline: p.seo_title, description: p.meta_description, mainEntityOfPage: url,
    author: { "@type": "Person", name: author }, publisher: { "@type": "Organization", name: "Harmonious", url: "https://harmonious.co" },
    ...(published ? { datePublished: published } : {}), dateModified: modified,
  }];
  if (p.faq.length) graph.push({ "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

/** Share of the article's 8-word phrases that also appear in the source text (0–100). */
export function overlapPercent(article: string, sources: string): number {
  const words = (t: string) => norm(t.replace(/<[^>]+>/g, " ")).split(" ").filter(Boolean);
  const a = words(article), s = words(sources).join(" ");
  if (a.length < 8) return 0;
  let hit = 0, total = 0;
  for (let i = 0; i + 8 <= a.length; i += 4) { total++; if (s.includes(a.slice(i, i + 8).join(" "))) hit++; }
  return Math.round((hit / total) * 100);
}

export type Review = { kind: string; result: string; package_version: number; created_at: string };
/** What still blocks approval of this package version. Empty = ready. */
export function approvalGaps(seriesKey: string, packageVersion: number, reviews: Review[]): string[] {
  if (packageVersion < 1) return ["Generate or save a content package first."];
  const needed: ReviewKind[] = ["source_verification", "fact_check", "compliance", "originality"];
  if (seriesKey === "founders_friday") needed.push("founder_review");
  return needed.filter((k) => {
    const latest = reviews.filter((r) => r.kind === k && r.package_version === packageVersion).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return latest?.result !== "pass";
  }).map((k) => `${REVIEW_LABEL[k]} hasn't passed for version ${packageVersion}.`);
}
