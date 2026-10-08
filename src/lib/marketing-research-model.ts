/** Marketing research engine: pure scoring, dedupe and claim rules. No I/O. */
export const SCORE_WEIGHTS = { relevance: 0.25, timeliness: 0.2, seo: 0.2, engagement: 0.15, credibility: 0.15, commercial: 0.05 } as const;
export type ScoreParts = Record<keyof typeof SCORE_WEIGHTS, number>;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
export function opportunityScore(p: ScoreParts): number {
  let s = 0;
  for (const k of Object.keys(SCORE_WEIGHTS) as (keyof ScoreParts)[]) s += clamp(p[k]) * SCORE_WEIGHTS[k];
  return Math.round(s * 100) / 100;
}

/** 100 today, ~halves every 3 days, 0 after 30 days or unknown date. */
export function timelinessScore(publishedAt: string | null, now = new Date()): number {
  if (!publishedAt) return 0;
  const days = (now.getTime() - new Date(publishedAt).getTime()) / 86400000;
  if (!Number.isFinite(days) || days > 30) return 0;
  return clamp(100 * Math.pow(0.5, Math.max(0, days) / 3));
}

const RELEVANT = [
  "private fund", "private funds", "spv", "special purpose vehicle", "venture", "form d", "regulation d", "rule 506", "accredited investor",
  "investment adviser", "exempt reporting", "fund administrator", "beneficial ownership", "partnership", "k-1", "1065", "carried interest",
  "secondary", "ipo", "initial public offering", "acquisition", "startup", "capital raise", "crowdfunding", "private placement", "limited partner",
  "form pf", "custody", "anti-money laundering", "aml", "kyc", "qualified purchaser", "blue sky",
];
const COMMERCIAL = ["spv", "special purpose vehicle", "fund administrator", "form d", "k-1", "1065", "private fund", "venture fund", "fund formation"];

export function keywordHits(text: string, list: readonly string[] = RELEVANT): string[] {
  const t = ` ${text.toLowerCase()} `;
  return list.filter((k) => new RegExp(`[^a-z0-9]${k.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}[^a-z0-9]`).test(t));
}
/** Keyword heuristic used before (or without) AI enrichment. */
export function heuristicRelevance(text: string): { relevance: number; commercial: number; keywords: string[] } {
  const hits = keywordHits(text);
  return { relevance: clamp(hits.length * 25), commercial: clamp(keywordHits(text, COMMERCIAL).length * 40), keywords: hits.slice(0, 8) };
}

/** Normalized URL used to dedupe stories across runs and sources. */
export function dedupeKey(url: string, headline = ""): string {
  try {
    const u = new URL(url.trim());
    for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(p)) u.searchParams.delete(p);
    u.hash = "";
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return `headline:${headline.toLowerCase().replace(/\s+/g, " ").trim()}`;
  }
}

export const CLAIM_KINDS = ["fact", "analysis", "opinion", "projection", "hypothetical"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const CLAIM_LABEL: Record<ClaimKind, string> = { fact: "Verified fact", analysis: "Analysis", opinion: "Opinion", projection: "Projection", hypothetical: "Hypothetical example" };
export type Claim = { text: string; kind: ClaimKind; story_id: string | null; source_url: string | null; verification: "verified_primary" | "reported" | "unverified" | "not_applicable" };
export type KnownStory = { id: string; url: string; primary_source_urls: string[]; verification_status: string };

/**
 * Factual claims must cite a stored story. A fact backed only by secondary reporting is "reported";
 * a fact with no stored source is relabeled unverified (and blocks approval). Non-facts need no source.
 */
export function checkClaims(raw: { text: string; kind: string; story_id?: string | null }[], stories: KnownStory[]): { claims: Claim[]; unverified: number } {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const claims: Claim[] = raw.filter((c) => c.text?.trim()).map((c) => {
    const kind = (CLAIM_KINDS as readonly string[]).includes(c.kind) ? (c.kind as ClaimKind) : "analysis";
    const st = c.story_id ? byId.get(c.story_id) : undefined;
    if (kind !== "fact") return { text: c.text.trim(), kind, story_id: st?.id ?? null, source_url: st?.url ?? null, verification: "not_applicable" };
    if (!st) return { text: c.text.trim(), kind, story_id: null, source_url: null, verification: "unverified" };
    const primary = st.verification_status === "verified_primary";
    return { text: c.text.trim(), kind, story_id: st.id, source_url: st.primary_source_urls[0] ?? st.url, verification: primary ? "verified_primary" : st.verification_status === "reported" ? "reported" : "unverified" };
  });
  return { claims, unverified: claims.filter((c) => c.verification === "unverified").length };
}

/** A story becomes an alert (never a publication) when it is high-scoring and regulatory or very timely. */
export function shouldAlert(s: { score: number; regulatory_sensitivity: string; timeliness: number }): string | null {
  if (s.score >= 75 && s.regulatory_sensitivity === "high") return "High-scoring regulatory development";
  if (s.score >= 85 && s.timeliness >= 80) return "Major timely development";
  return null;
}
