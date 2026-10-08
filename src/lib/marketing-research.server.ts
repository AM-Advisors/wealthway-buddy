/**
 * Marketing research engine. Server-only.
 * Ingests official public feeds/APIs only (no scraping, no paywalls), dedupes, scores, enriches with AI,
 * suggests ideas per series and raises alerts. Nothing here publishes anything.
 */
import { STUDIO_ACCESS, STUDIO_MANAGERS, weekStart } from "@/lib/marketing-studio-model";
import { checkClaims, dedupeKey, heuristicRelevance, opportunityScore, shouldAlert, timelinessScore, type KnownStory } from "@/lib/marketing-research-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const UA = "Harmonious Marketing Research (marketing@harmonious.co)";
const MODEL = "openai/gpt-6-astra";
const PER_SOURCE = 20;
const ENRICH_BATCH = 8;
const ENRICH_PER_RUN = 24;
const JOB = "research";
const SERIES = ["market_monday", "thesis_tuesday", "whatever_wednesday", "fund_academy_thursday", "founders_friday"];

async function ctx(userId: string, manager = false) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => STUDIO_ACCESS.includes(r))) throw new Error("Only the Marketing team can use research.");
  if (manager && !roles.some((r) => STUDIO_MANAGERS.includes(r))) throw new Error("Only a marketing manager can do this.");
  return { db, roles };
}

/* ---------- AI (streamed Responses call, strict JSON) ---------- */
class AiStop extends Error { constructor(public status: number, msg: string) { super(msg); } }
async function aiJson(instructions: string, input: string, name: string, schema: any): Promise<any> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiStop(401, "AI isn't configured.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: MODEL, stream: true, store: false, reasoning: { effort: "low" }, instructions, input,
      text: { format: { type: "json_schema", name, strict: true, schema } } }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let msg = `AI request failed [${res.status}]`;
    try { msg = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? msg; } catch { /* keep */ }
    throw new AiStop(res.status, msg);
  }
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim(); if (!d || d === "[DONE]") continue;
      let ev: any; try { ev = JSON.parse(d); } catch { continue; }
      if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
      else if (ev.type === "response.refusal.delta" || ev.type === "response.failed" || ev.type === "error") throw new AiStop(422, "The AI declined or failed this request.");
    }
  }
  if (!text.trim()) throw new AiStop(422, "The AI returned nothing.");
  return JSON.parse(text);
}

async function pausedReason(db: any): Promise<string | null> {
  const { data } = await db.from("marketing_research_state").select("paused_reason").eq("job", JOB).maybeSingle();
  return data?.paused_reason ?? null;
}
async function pause(db: any, reason: string) {
  await db.from("marketing_research_state").upsert({ job: JOB, paused_reason: reason, paused_at: new Date().toISOString(), updated_at: new Date().toISOString() });
}

/* ---------- Feed fetching (official sources only) ---------- */
type Raw = { headline: string; url: string; published_at: string | null; summary: string };
const unxml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const tag = (x: string, t: string) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? unxml(m[1]!) : ""; };
const iso = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

async function fetchSource(src: any): Promise<Raw[]> {
  if (src.kind === "federal_register") {
    const u = `https://www.federalregister.gov/api/v1/documents.json?conditions%5Bagencies%5D%5B%5D=${encodeURIComponent(src.url)}&order=newest&per_page=${PER_SOURCE}&fields%5B%5D=title&fields%5B%5D=html_url&fields%5B%5D=publication_date&fields%5B%5D=abstract&fields%5B%5D=type`;
    const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) throw new Error(`Federal Register ${r.status}`);
    const j: any = await r.json();
    return ((j.results ?? []) as any[]).map((d) => ({ headline: String(d.title ?? ""), url: String(d.html_url ?? ""), published_at: d.publication_date ? `${d.publication_date}T12:00:00Z` : null, summary: `${d.type ?? ""}. ${d.abstract ?? ""}`.trim() }));
  }
  const r = await fetch(src.url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml" } });
  if (!r.ok) throw new Error(`Feed ${r.status}`);
  const xml = await r.text();
  if (src.kind === "atom") {
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, PER_SOURCE).map(([, e]) => ({
      headline: tag(e!, "title"), url: (e!.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "").replace(/&amp;/g, "&"), published_at: iso(tag(e!, "updated")), summary: tag(e!, "summary").slice(0, 1500),
    }));
  }
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, PER_SOURCE).map(([, e]) => ({
    headline: tag(e!, "title"), url: tag(e!, "link"), published_at: iso(tag(e!, "pubDate") || tag(e!, "dc:date")), summary: tag(e!, "description").slice(0, 1500),
  }));
}

function baseScores(src: any, raw: Raw) {
  const h = heuristicRelevance(`${raw.headline} ${raw.summary}`);
  const parts = { relevance: h.relevance, timeliness: timelinessScore(raw.published_at), seo: 0, engagement: 0, credibility: src.credibility, commercial: h.commercial };
  return { ...parts, keywords: h.keywords, score: opportunityScore(parts) };
}

/* ---------- Ingestion ---------- */
async function ingest(db: any) {
  const { data: sources } = await db.from("marketing_research_sources").select("*").eq("active", true).in("kind", ["rss", "atom", "federal_register"]);
  let added = 0; const errors: string[] = [];
  for (const src of (sources ?? []) as any[]) {
    try {
      const items = (await fetchSource(src)).filter((r) => r.headline && /^https?:\/\//.test(r.url));
      const rows = items.map((r) => {
        const s = baseScores(src, r);
        return {
          source_key: src.key, dedupe_key: dedupeKey(r.url, r.headline), headline: r.headline.slice(0, 500), publisher: src.publisher, url: r.url,
          published_at: r.published_at, summary: r.summary, primary_source_urls: src.is_primary ? [r.url] : [],
          verification_status: src.is_primary ? "verified_primary" : "reported", confidence: src.is_primary ? "high" : "medium",
          relevance: s.relevance, timeliness: s.timeliness, credibility: s.credibility, commercial: s.commercial, keywords: s.keywords, score: s.score,
        };
      });
      if (rows.length) {
        const { data, error } = await db.from("marketing_research_stories").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
        if (error) throw new Error(error.message);
        added += (data ?? []).length;
      }
      await db.from("marketing_research_sources").update({ last_fetched_at: new Date().toISOString(), last_error: null }).eq("key", src.key);
    } catch (e: any) {
      errors.push(`${src.key}: ${e.message}`);
      await db.from("marketing_research_sources").update({ last_fetched_at: new Date().toISOString(), last_error: String(e.message).slice(0, 300) }).eq("key", src.key);
    }
  }
  return { added, errors };
}

/* ---------- Enrichment ---------- */
const S = { type: "string" }, N = { type: "integer" };
const ENRICH_SCHEMA = { type: "object", additionalProperties: false, required: ["stories"], properties: { stories: { type: "array", items: {
  type: "object", additionalProperties: false,
  required: ["id", "audience", "suggested_series", "keywords", "angle", "relevance", "engagement", "seo", "commercial", "regulatory_sensitivity", "facts", "numbers"],
  properties: {
    id: S, audience: S, suggested_series: { type: "string", enum: SERIES }, keywords: { type: "array", items: S }, angle: S,
    relevance: N, engagement: N, seo: N, commercial: N, regulatory_sensitivity: { type: "string", enum: ["low", "medium", "high"] },
    facts: { type: "array", items: S }, numbers: { type: "array", items: { type: "object", additionalProperties: false, required: ["value", "context"], properties: { value: S, context: S } } },
  } } } } };
const ENRICH_RULES = `You classify public news for Harmonious (fund administration for venture funds, SPVs and their investors).
For each story score 0-100: relevance to private funds/SPVs/fund managers/investors; engagement potential; search (SEO) potential; commercial relevance to fund administration.
regulatory_sensitivity: high if it changes or enforces rules for funds, advisers, offerings, tax or AML.
facts: ONLY statements explicitly present in the provided headline/summary, restated plainly. numbers: ONLY figures that appear verbatim in the text. Never add outside knowledge, never guess.
angle: one sentence on why it matters to fund managers (analysis, not fact). Pick the best weekly series.`;

async function enrich(db: any, limit = ENRICH_PER_RUN) {
  const { data: todo } = await db.from("marketing_research_stories").select("id, source_key, headline, summary, published_at, credibility")
    .is("enriched_at", null).is("dismissed_at", null).order("score", { ascending: false }).limit(limit);
  let done = 0;
  const list = (todo ?? []) as any[];
  for (let i = 0; i < list.length; i += ENRICH_BATCH) {
    const batch = list.slice(i, i + ENRICH_BATCH);
    const input = batch.map((s) => `id: ${s.id}\nheadline: ${s.headline}\nsummary: ${String(s.summary).slice(0, 1200)}`).join("\n\n---\n\n");
    const out = await aiJson(ENRICH_RULES, input, "story_enrichment", ENRICH_SCHEMA);
    for (const e of (out.stories ?? []) as any[]) {
      const s = batch.find((b) => b.id === e.id); if (!s) continue;
      const parts = { relevance: e.relevance, timeliness: timelinessScore(s.published_at), seo: e.seo, engagement: e.engagement, credibility: s.credibility, commercial: e.commercial };
      const score = opportunityScore(parts);
      await db.from("marketing_research_stories").update({
        audience: String(e.audience).slice(0, 300), suggested_series: e.suggested_series, keywords: (e.keywords ?? []).slice(0, 10).map(String), angle: String(e.angle).slice(0, 600),
        relevance: parts.relevance, engagement: parts.engagement, seo: parts.seo, commercial: parts.commercial, timeliness: parts.timeliness,
        regulatory_sensitivity: e.regulatory_sensitivity, facts: (e.facts ?? []).slice(0, 8), numbers: (e.numbers ?? []).slice(0, 8), score, enriched_at: new Date().toISOString(),
      }).eq("id", s.id);
      const reason = shouldAlert({ score, regulatory_sensitivity: e.regulatory_sensitivity, timeliness: parts.timeliness });
      if (reason) await db.from("marketing_research_alerts").upsert({ story_id: s.id, reason }, { onConflict: "story_id", ignoreDuplicates: true });
      done++;
    }
  }
  return done;
}

/* ---------- Ideas ---------- */
const IDEA_SCHEMA = { type: "object", additionalProperties: false, required: ["ideas"], properties: { ideas: { type: "array", items: {
  type: "object", additionalProperties: false, required: ["series_key", "title", "social_headline", "angle", "audience", "keywords", "story_ids", "claims"],
  properties: {
    series_key: { type: "string", enum: SERIES }, title: S, social_headline: S, angle: S, audience: S, keywords: { type: "array", items: S }, story_ids: { type: "array", items: S },
    claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "kind", "story_id"], properties: {
      text: S, kind: { type: "string", enum: ["fact", "analysis", "opinion", "projection", "hypothetical"] }, story_id: { type: ["string", "null"] } } } },
  } } } } };

async function makeIdeas(db: any) {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: stories }, { data: series }] = await Promise.all([
    db.from("marketing_research_stories").select("id, headline, publisher, url, summary, facts, angle, suggested_series, primary_source_urls, verification_status, score")
      .is("dismissed_at", null).gte("retrieved_at", since).order("score", { ascending: false }).limit(30),
    db.from("marketing_series").select("*").eq("active", true).order("weekday"),
  ]);
  const st = (stories ?? []) as any[];
  if (!st.length) return 0;
  const guide = ((series ?? []) as any[]).map((s) => `${s.key} (${s.name}, ${s.intention}): ${s.purpose} Voice: ${s.voice}${s.guardrail ? ` RULE: ${s.guardrail}` : ""}`).join("\n");
  const input = st.map((s) => `story_id: ${s.id}\npublisher: ${s.publisher}\nheadline: ${s.headline}\nfacts: ${JSON.stringify(s.facts)}\nsummary: ${String(s.summary).slice(0, 600)}`).join("\n\n---\n\n");
  const out = await aiJson(
    `You plan content for Harmonious's five weekly series:\n${guide}\nReturn 3 to 5 ideas for EACH series (15-25 total) grounded in the stories provided.
Each idea lists the story_ids it draws on and its key claims. Label every claim: fact (must be stated in a cited story, give its story_id), analysis, opinion (Harmonious's view), projection, or hypothetical (clearly an example).
Never invent sources, statistics, quotes, regulator statements or current events. Founders Friday: never invent personal experiences or attribute opinions to Alyssa Pettit — frame as questions or topics for her to speak to. Whatever Wednesday ideas may be community/engagement prompts with no facts.`,
    input, "series_ideas", IDEA_SCHEMA);
  const known: KnownStory[] = st.map((s) => ({ id: s.id, url: s.url, primary_source_urls: s.primary_source_urls ?? [], verification_status: s.verification_status }));
  const ids = new Set(st.map((s) => s.id));
  const today = new Date().toISOString().slice(0, 10);
  const rows = ((out.ideas ?? []) as any[]).map((i) => {
    const { claims, unverified } = checkClaims(i.claims ?? [], known);
    return { series_key: i.series_key, idea_date: today, title: String(i.title).slice(0, 300), social_headline: String(i.social_headline).slice(0, 300), angle: String(i.angle).slice(0, 1000),
      audience: String(i.audience).slice(0, 300), keywords: (i.keywords ?? []).slice(0, 10).map(String), story_ids: (i.story_ids ?? []).filter((x: string) => ids.has(x)), claims, unverified_claims: unverified };
  });
  if (rows.length) { const { error } = await db.from("marketing_research_ideas").insert(rows); if (error) throw new Error(error.message); }
  return rows.length;
}

/* ---------- Run (scheduler + manual) ---------- */
export async function runResearch(opts: { ideas?: boolean; manualBy?: string } = {}) {
  const db = await admin();
  const paused = await pausedReason(db);
  if (paused && !opts.manualBy) return { skipped: "paused", reason: paused };
  const now = new Date();
  const { data: running } = await db.from("marketing_research_runs").select("id").eq("job", JOB).eq("status", "running").gt("lease_until", now.toISOString()).limit(1);
  if ((running ?? []).length) return { skipped: "already running" };
  const { data: run } = await db.from("marketing_research_runs").insert({ job: JOB, lease_until: new Date(now.getTime() + 10 * 60000).toISOString() }).select().single();
  const result: any = {};
  try {
    result.ingest = await ingest(db);
    result.enriched = await enrich(db);
    if (opts.ideas) result.ideas = await makeIdeas(db);
    if (paused && opts.manualBy) await db.from("marketing_research_state").update({ paused_reason: null, paused_at: null, updated_at: new Date().toISOString() }).eq("job", JOB);
    await db.from("marketing_research_runs").update({ status: "done", finished_at: new Date().toISOString(), result }).eq("id", run.id);
    return result;
  } catch (e: any) {
    const status = e instanceof AiStop ? e.status : 0;
    if (status === 402 || status === 403 || status === 401) await pause(db, `AI unavailable [${status}]: ${e.message}`);
    await db.from("marketing_research_runs").update({ status: status === 429 ? "rate_limited" : "failed", finished_at: new Date().toISOString(), result, error: String(e.message).slice(0, 500) }).eq("id", run.id);
    if (opts.manualBy) throw new Error(status === 429 ? "The AI is busy right now. Try again in a few minutes." : e.message);
    return { ...result, error: e.message };
  }
}

/* ---------- Staff actions ---------- */
export async function feed(userId: string, days: number) {
  const { db } = await ctx(userId);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [stories, ideas, alerts, sources, state, runs] = await Promise.all([
    db.from("marketing_research_stories").select("*").is("dismissed_at", null).gte("retrieved_at", since).order("score", { ascending: false }).limit(150),
    db.from("marketing_research_ideas").select("*").gte("idea_date", since.slice(0, 10)).order("created_at", { ascending: false }).limit(150),
    db.from("marketing_research_alerts").select("*, story:marketing_research_stories(headline, url, publisher, score)").is("acknowledged_at", null).order("created_at", { ascending: false }).limit(20),
    db.from("marketing_research_sources").select("*").order("active", { ascending: false }).order("name"),
    db.from("marketing_research_state").select("*").eq("job", JOB).maybeSingle(),
    db.from("marketing_research_runs").select("started_at, finished_at, status, result, error").eq("job", JOB).order("started_at", { ascending: false }).limit(5),
  ]);
  return { stories: stories.data ?? [], ideas: ideas.data ?? [], alerts: alerts.data ?? [], sources: sources.data ?? [], paused: state.data?.paused_reason ?? null, runs: runs.data ?? [] };
}

export async function runNow(userId: string, ideas: boolean) {
  await ctx(userId, true);
  return runResearch({ ideas, manualBy: userId });
}

export async function dismissStory(userId: string, id: string) {
  const { db } = await ctx(userId);
  await db.from("marketing_research_stories").update({ dismissed_at: new Date().toISOString(), dismissed_by: userId }).eq("id", id);
  return { ok: true };
}
export async function ackAlert(userId: string, id: string) {
  const { db } = await ctx(userId);
  await db.from("marketing_research_alerts").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId }).eq("id", id).is("acknowledged_at", null);
  return { ok: true };
}

/** Manual entry for licensed/blocked sources. Never marked primary unless it is an official URL and the user says so. */
export async function addStory(userId: string, d: { source_key: string; headline: string; url: string; published_at: string | null; summary: string; primary_source_url: string | null }) {
  const { db } = await ctx(userId);
  const { data: src } = await db.from("marketing_research_sources").select("*").eq("key", d.source_key).single();
  if (!src) throw new Error("Unknown source.");
  const s = baseScores(src, { headline: d.headline, url: d.url, published_at: d.published_at, summary: d.summary });
  const primary = d.primary_source_url ? [d.primary_source_url] : [];
  const { data, error } = await db.from("marketing_research_stories").insert({
    source_key: src.key, dedupe_key: dedupeKey(d.url, d.headline), headline: d.headline, publisher: src.publisher, url: d.url, published_at: d.published_at, summary: d.summary,
    primary_source_urls: primary, verification_status: primary.length ? "verified_primary" : "reported", confidence: primary.length ? "high" : "medium",
    relevance: s.relevance, timeliness: s.timeliness, credibility: s.credibility, commercial: s.commercial, keywords: s.keywords, score: s.score, created_by: userId,
  }).select().single();
  if (error) throw new Error(String(error.code) === "23505" ? "That story is already in the feed." : error.message);
  return data;
}

/** Turns an idea into a Studio calendar item (status Idea) with its citation records. */
export async function convertIdea(userId: string, id: string, publishAt: string | null) {
  const { db } = await ctx(userId);
  const { data: idea } = await db.from("marketing_research_ideas").select("*").eq("id", id).single();
  if (!idea) throw new Error("Idea not found.");
  if (idea.converted_item_id) throw new Error("This idea is already on the calendar.");
  const { data: stories } = idea.story_ids.length ? await db.from("marketing_research_stories").select("id, url, primary_source_urls").in("id", idea.story_ids) : { data: [] };
  const urls = [...new Set(((stories ?? []) as any[]).flatMap((s) => [...(s.primary_source_urls ?? []), s.url]))].slice(0, 30);
  const { saveItem } = await import("@/lib/marketing-studio.server");
  const item = await saveItem(userId, {
    series_key: idea.series_key, publish_at: publishAt, article_title: idea.title, social_headline: idea.social_headline, topic: idea.angle,
    audience: idea.audience, keywords: idea.keywords, source_urls: urls, platforms: ["linkedin"],
  });
  await db.from("marketing_content_items").update({ research_idea_id: idea.id, unverified_claims: idea.unverified_claims, week_start: publishAt ? weekStart(new Date(publishAt)) : null }).eq("id", item.id);
  const cites = ((idea.claims ?? []) as any[]).map((c) => ({ item_id: item.id, story_id: c.story_id, claim: c.text, claim_kind: c.kind, source_url: c.source_url, verification: c.verification, created_by: userId }));
  if (cites.length) { const { error } = await db.from("marketing_content_citations").insert(cites); if (error) throw new Error(error.message); }
  const { data: claimed } = await db.from("marketing_research_ideas").update({ converted_item_id: item.id, converted_by: userId, converted_at: new Date().toISOString() }).eq("id", id).is("converted_item_id", null).select("id");
  if (!(claimed ?? []).length) throw new Error("Someone else converted this idea at the same time.");
  return item;
}

export async function citations(userId: string, itemId: string) {
  const { db } = await ctx(userId);
  const { data } = await db.from("marketing_content_citations").select("*").eq("item_id", itemId).order("created_at");
  return data ?? [];
}
