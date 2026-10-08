/**
 * Marketing content workspace (server-only). Generates editable, versioned content packages for a Studio item,
 * records append-only reviews, and hands drafts to the existing Classroom CMS and social posts.
 * Nothing here publishes or schedules; the Studio approval gate and each channel's own approval still apply.
 */
import { STUDIO_ACCESS, STUDIO_REVIEWERS, isLocked } from "@/lib/marketing-studio-model";
import { FOUNDER_REVIEW_ROLE, seriesTemplate, overlapPercent, sanitizePackage, type ContentPackage } from "@/lib/marketing-content-model";
import { aiJson } from "@/lib/marketing-research.server";
import { COPY_RULES } from "@/lib/marketing-brand";
import { CLAIM_CLASSES, REG_INTERPRETATION_REVIEWERS, SERVICE_PAGES, buildArticleSchema, canonicalFor, normalizeClass, type SitePage } from "@/lib/marketing-seo-model";
import { MARKETING_ORIGIN } from "@/lib/marketing/site-config";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const MODEL = "openai/gpt-6-astra";
const SITE = MARKETING_ORIGIN;

async function ctx(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => STUDIO_ACCESS.includes(r))) throw new Error("Only the Marketing team can use the Studio.");
  return { db, roles };
}
async function logEvent(db: any, item_id: string, action: string, actor_id: string, note?: string | null) {
  await db.from("marketing_content_item_events").insert({ item_id, action, actor_id, note: note ?? null });
}

async function sourceMaterial(db: any, item: any) {
  const { data: cites } = await db.from("marketing_content_citations").select("*").eq("item_id", item.id);
  const urls = [...new Set([...(item.source_urls ?? []), ...((cites ?? []) as any[]).map((c) => c.source_url).filter(Boolean)])] as string[];
  const { data: stories } = urls.length
    ? await db.from("marketing_research_stories").select("headline, publisher, url, primary_source_url, summary, facts, numbers, published_at").or(urls.map((u) => `url.eq.${u}`).join(",")).limit(20)
    : { data: [] };
  const primary = ((stories ?? []) as any[]).map((s) => s.primary_source_url).filter(Boolean);
  const allowed = [...new Set([...urls, ...primary])];
  const factText = [
    ...((stories ?? []) as any[]).flatMap((s) => [s.summary ?? "", ...(s.facts ?? []).map((f: any) => typeof f === "string" ? f : JSON.stringify(f)), ...(s.numbers ?? []).map((n: any) => typeof n === "string" ? n : JSON.stringify(n))]),
    ...((cites ?? []) as any[]).filter((c) => c.claim_kind === "fact" && c.verification !== "unverified").map((c) => c.claim),
  ].join("\n");
  return { cites: cites ?? [], stories: stories ?? [], allowed, factText };
}

/** Published Classroom articles plus service pages. Drafts are listed but marked unpublished so they're never suggested. */
async function sitePages(db: any): Promise<SitePage[]> {
  const { data } = await db.from("classroom_articles").select("slug, status, current_version_id, published_version_id").limit(200);
  const ids = ((data ?? []) as any[]).map((a) => a.published_version_id ?? a.current_version_id).filter(Boolean);
  const { data: vers } = ids.length ? await db.from("classroom_article_versions").select("id, title").in("id", ids) : { data: [] };
  const title = Object.fromEntries(((vers ?? []) as any[]).map((v) => [v.id, v.title]));
  const arts: SitePage[] = ((data ?? []) as any[]).map((a) => ({ url: canonicalFor(a.slug), title: title[a.published_version_id ?? a.current_version_id] ?? a.slug, kind: "article", published: a.status === "published" }));
  return [...SERVICE_PAGES, ...arts];
}
async function internalPages(db: any) {
  return (await sitePages(db)).filter((p) => p.published).map((p) => p.url);
}

export async function workspace(userId: string, itemId: string) {
  const { db, roles } = await ctx(userId);
  const { data: item } = await db.from("marketing_content_items").select("*").eq("id", itemId).single();
  if (!item) throw new Error("Not found.");
  const [{ data: series }, { data: pkgs }, { data: reviews }, src, { data: posts }, { data: article }] = await Promise.all([
    db.from("marketing_series").select("*").eq("key", item.series_key).maybeSingle(),
    db.from("marketing_content_packages").select("*").eq("item_id", itemId).order("version", { ascending: false }),
    db.from("marketing_content_reviews").select("*").eq("item_id", itemId).order("created_at", { ascending: false }),
    sourceMaterial(db, item),
    (item.post_ids ?? []).length ? db.from("marketing_posts").select("id, title, status, channels").in("id", item.post_ids) : Promise.resolve({ data: [] }),
    item.article_id ? db.from("classroom_articles").select("id, slug, status").eq("id", item.article_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const ids = [...new Set([...(pkgs ?? []), ...(reviews ?? [])].map((r: any) => r.created_by ?? r.actor_id))];
  const { data: profs } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const people = Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
  const pages = await sitePages(db);
  const [{ data: others }, { data: gsc }, { data: gscSet }] = await Promise.all([
    db.from("marketing_content_items").select("id, article_title").neq("id", itemId).not("article_title", "is", null).limit(300),
    db.from("marketing_search_rows").select("query, clicks, impressions, position, page").ilike("page", `%/post/${(pkgs ?? [])[0]?.package?.slug ?? "__none__"}%`).limit(50),
    db.from("marketing_search_settings").select("site_url, last_refresh_at").eq("id", 1).maybeSingle(),
  ]);
  const existingTitles = [...((others ?? []) as any[]).map((o) => o.article_title as string), ...pages.filter((p) => p.kind === "article").map((p) => p.title)];
  const analytics = {
    search_console: gscSet?.site_url ? `Connected (${gscSet.site_url})` : process.env.GOOGLE_SEARCH_CONSOLE_API_KEY ? "Connected — harmonious.co property not verified" : "Not connected",
    ga4: "Not connected", bing: "Not connected",
  };
  return { pages, existingTitles, analytics, measured: gsc ?? [], canonicalLive: false,
    item, series, packages: pkgs ?? [], reviews: reviews ?? [], sources: src.allowed, stories: src.stories, citations: src.cites, posts: posts ?? [], article, people, roles, me: userId };
}

const S = { type: "string" } as const;
const SA = { type: "array", items: S } as const;
const obj = (props: Record<string, any>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const SCHEMA = obj({
  seo_title: S, social_headline: S, slug: S, meta_title: S, meta_description: S, primary_keyword: S, secondary_keywords: SA, search_intent: S,
  outline: { type: "array", items: obj({ heading: S, points: SA }) }, body_html: S,
  faq: { type: "array", items: obj({ q: S, a: S }) },
  internal_links: { type: "array", items: obj({ label: S, url: S }) },
  citations: { type: "array", items: obj({ label: S, url: S }) }, cta: S, cta_options: SA,
  claims: { type: "array", items: obj({ text: S, kind: { type: "string", enum: [...CLAIM_CLASSES] }, source_url: S, corroborating_url: S }) },
  h1: S, opening_answer: S, related_questions: SA, audience: S, topic_cluster: S, pillar_page: S, supporting_articles: SA, service_pages: SA,
  social: obj({ linkedin_company: S, linkedin_executive: S, facebook: S, instagram: S, x: S, email_subject: S, email_body: S }),
  graphics: { type: "array", items: obj({ template: { type: "string", enum: ["breaking", "regulatory", "stat", "quote", "carousel", "comparison", "academy", "poll"] }, size: { type: "string", enum: ["square", "portrait", "landscape", "story"] }, headline: S, subhead: S, stat: S, stat_source_url: S, bullets: SA }) },
});

async function nextVersion(db: any, itemId: string) {
  const { data } = await db.from("marketing_content_packages").select("version").eq("item_id", itemId).order("version", { ascending: false }).limit(1);
  return ((data ?? [])[0]?.version ?? 0) + 1;
}
async function store(db: any, item: any, userId: string, p: ContentPackage, ai: boolean, note: string | null) {
  const version = await nextVersion(db, item.id);
  const founders = item.series_key === "founders_friday";
  const final = { ...p, h1: p.h1 || p.seo_title, schema_jsonld: buildArticleSchema({ slug: p.slug, title: p.h1 || p.seo_title, description: p.meta_description, author: founders ? "Alyssa Pettit" : "Harmonious", authorIsPerson: founders, published: item.publish_at, modified: new Date().toISOString(), faq: p.faq, bodyHtml: p.body_html, blog: founders }) };
  const { error } = await db.from("marketing_content_packages").insert({ item_id: item.id, version, package: final, ai_generated: ai, model: ai ? MODEL : null, note, created_by: userId });
  if (error) throw new Error(error.message);
  // Unverified facts (research citations + package claims) block Studio approval.
  const { count } = await db.from("marketing_content_citations").select("id", { count: "exact", head: true }).eq("item_id", item.id).eq("claim_kind", "fact").eq("verification", "unverified");
  const unverified = (count ?? 0) + (final.checks?.unverified_facts ?? 0);
  await db.from("marketing_content_items").update({ package_version: version, unverified_claims: unverified, updated_at: new Date().toISOString() }).eq("id", item.id);
  await logEvent(db, item.id, ai ? "package_ai_draft" : "package_edited", userId, `Package v${version}${ai ? " (AI draft — internal)" : ""}`);
  return { version, package: final };
}

export async function generate(userId: string, itemId: string, guidance: string | null) {
  const { db } = await ctx(userId);
  const { data: item } = await db.from("marketing_content_items").select("*").eq("id", itemId).single();
  if (!item) throw new Error("Not found.");
  if (isLocked(item.status)) throw new Error("Approved content is locked. Send it back to edit.");
  const { data: series } = await db.from("marketing_series").select("*").eq("key", item.series_key).maybeSingle();
  const src = await sourceMaterial(db, item);
  if (!src.allowed.length) throw new Error("Add at least one source to this item before generating.");
  const internal = await internalPages(db);
  const founders = item.series_key === "founders_friday";
  const instructions = [
    "You draft a complete content package for Harmonious (harmonious.co), a fund administration platform for venture funds, SPVs and investors.",
    `Series: ${series?.name ?? item.series_key}. Voice: ${series?.voice ?? "clear, practical, professional"}. Purpose: ${series?.purpose ?? ""}.`,
    `Series template: ${seriesTemplate(item.series_key).summary}`, ...seriesTemplate(item.series_key).rules,
    founders ? "FOUNDERS FRIDAY: never invent Alyssa's experiences, opinions, quotes or stories. Write questions and [ALYSSA TO ADD] placeholders where her perspective belongs." : "",
    "Use ONLY the facts and numbers in the SOURCE MATERIAL. Never invent statistics, quotes, SEC statements, laws, clients or current events. Label analysis as analysis. No investment, legal or tax advice.",
    "SEO/GEO: question-based H2/H3 headings, a direct factual answer in the first paragraph under each question, accurate definitions, semantic HTML (h2, h3, p, ul, ol, strong) with no scripts or inline styles. Original analysis. Never promise rankings or AI citations.",
    "citations: only URLs from SOURCES. internal_links: only URLs from INTERNAL PAGES, choose 2–5 relevant ones. slug: lowercase-hyphenated.",
    "meta_title ≤ 60 chars, meta_description ≤ 155 chars. FAQ 3–5 items when useful, answers must match the article.",
    "Social: write different text per platform. linkedin_company (professional, 120–200 words, 3 hashtags), linkedin_executive (first person ONLY as framing questions/placeholders for the executive; never invent their opinions), facebook (conversational, 60–120 words), instagram (hook line, short lines, 5–8 hashtags, 'link in bio'), x (≤ 270 chars incl. 1–2 hashtags), email_subject (≤ 60 chars) and email_body (short newsletter blurb with CTA).",
    "Graphics: 2–4 specs using fitting templates and sizes. stat must be copied verbatim from SOURCE MATERIAL with its stat_source_url from SOURCES, or empty string.",
    "SEO & AI search: h1 = the visible page title (no H1 in body_html). opening_answer = a direct 1–2 sentence answer to the main question, also used as the first paragraph. related_questions = 3–6 questions readers ask. Name entities explicitly (Harmonious, SEC, IRS). Use a comparison table where it helps, practical examples (label hypothetical ones), and plain definitions. Never stuff keywords, never write hidden text, never claim how any search or AI engine ranks or cites content, never state search volume, difficulty or rankings.",
    "topic_cluster: one of fund administration, SPV administration, cap table management, investor onboarding, KYC/KYB/AML, accredited investor verification, Rule 506(b) and 506(c), Form D and Blue Sky filings, fund accounting and NAV, K-1s and partnership taxes, startup fundraising and dilution, private-market liquidity and secondaries. pillar_page, supporting_articles and service_pages: only URLs from INTERNAL PAGES (or empty).",
    "claim kinds: primary_fact (stated in a regulator or primary document), reported (a third party or company said it — e.g. a press release is attributed to the company), corroborated (two independent SOURCES; set corroborating_url), regulatory_text (quotes or paraphrases rule text), regulatory_interpretation (what a rule means for readers), analysis (Harmonious analysis or opinion), projection, hypothetical, unverified. Form D amounts are issuer-reported, never verified proceeds. corroborating_url is empty unless corroborated.",
    "claims: list every factual statement, analysis, opinion, projection and hypothetical example the article relies on, with kind set honestly. A fact needs source_url copied from SOURCES; non-facts use an empty source_url unless they build on one source. Never present analysis, opinion or projection as fact.",
    "Never write quotation marks around words unless they are copied verbatim from SOURCE MATERIAL. Never invent quotes, statistics, regulatory requirements or personal experiences.",
    "cta: the main call to action. cta_options: 2–3 alternative CTAs suited to this series.",
    "social.email_body: a complete short newsletter version (headline, 2–3 short paragraphs, CTA).",
    "schema_jsonld: return an empty string (built separately).", COPY_RULES,
  ].filter(Boolean).join("\n");
  const input = [
    `TITLE: ${item.article_title}\nTOPIC: ${item.topic ?? ""}\nAUDIENCE: ${item.audience ?? ""}\nKEYWORDS: ${(item.keywords ?? []).join(", ")}\nCTA: ${item.cta ?? ""}`,
    guidance ? `EDITOR GUIDANCE: ${guidance}` : "",
    `SOURCES:\n${src.allowed.join("\n")}`,
    `INTERNAL PAGES:\n${internal.join("\n")}`,
    `SOURCE MATERIAL:\n${src.stories.map((s: any) => `- ${s.headline} (${s.publisher}, ${s.url}${s.primary_source_url ? `, primary ${s.primary_source_url}` : ""})\n  ${s.summary ?? ""}\n  Facts: ${JSON.stringify(s.facts ?? [])}\n  Numbers: ${JSON.stringify(s.numbers ?? [])}`).join("\n")}\n${src.cites.map((c: any) => `- [${c.claim_kind}/${c.verification}] ${c.claim} (${c.source_url ?? "no source"})`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  const raw = (await aiJson(instructions, input, "content_package", SCHEMA)) as ContentPackage;
  const clean = sanitizePackage(raw, src.allowed, internal, src.factText);
  return store(db, item, userId, clean, true, guidance);
}

export async function save(userId: string, itemId: string, p: ContentPackage, note: string | null) {
  const { db } = await ctx(userId);
  const { data: item } = await db.from("marketing_content_items").select("*").eq("id", itemId).single();
  if (!item) throw new Error("Not found.");
  if (isLocked(item.status)) throw new Error("Approved content is locked. Send it back to edit.");
  const src = await sourceMaterial(db, item);
  const clean = sanitizePackage(p, src.allowed, await internalPages(db), src.factText);
  return store(db, item, userId, clean, false, note);
}

export async function originality(userId: string, itemId: string) {
  const { db } = await ctx(userId);
  const { data: item } = await db.from("marketing_content_items").select("*").eq("id", itemId).single();
  const { data: pkg } = await db.from("marketing_content_packages").select("package").eq("item_id", itemId).eq("version", item?.package_version ?? 0).maybeSingle();
  if (!pkg) throw new Error("No package yet.");
  const src = await sourceMaterial(db, item);
  return { overlap: overlapPercent(pkg.package.body_html ?? "", src.stories.map((s: any) => s.summary ?? "").join(" ") + " " + src.factText) };
}

export async function review(userId: string, itemId: string, kind: string, result: "pass" | "fail", note: string | null) {
  const { db, roles } = await ctx(userId);
  const { data: item } = await db.from("marketing_content_items").select("*").eq("id", itemId).single();
  if (!item) throw new Error("Not found.");
  if (!item.package_version) throw new Error("Generate or save a content package first.");
  const n = (note ?? "").trim();
  if (kind === "founder_review") {
    if (item.series_key !== "founders_friday") throw new Error("Alyssa's review applies to Founders Friday only.");
    if (!roles.includes(FOUNDER_REVIEW_ROLE)) throw new Error("Only Alyssa (CEO) can record this review.");
  } else {
    if (!roles.some((r) => STUDIO_REVIEWERS.includes(r))) throw new Error("Only a reviewer can record this.");
    if (kind === "compliance" && result === "pass") {
      const { data: pk } = await db.from("marketing_content_packages").select("package").eq("item_id", itemId).eq("version", item.package_version).maybeSingle();
      const interp = ((pk?.package?.claims ?? []) as any[]).some((c) => normalizeClass(c.kind) === "regulatory_interpretation");
      if (interp && !roles.some((r) => REG_INTERPRETATION_REVIEWERS.includes(r))) throw new Error("This package interprets regulations, so compliance must be passed by a compliance reviewer or executive.");
    }
    const self = item.author_id === userId || (await db.from("marketing_content_packages").select("id").eq("item_id", itemId).eq("version", item.package_version).eq("created_by", userId).maybeSingle()).data;
    if (self && !roles.includes("super_admin")) throw new Error("Someone other than the author must review this.");
    if (self && !n) throw new Error("Super Admin self-review needs a reason.");
  }
  if (result === "fail" && !n) throw new Error("Say what needs to change.");
  const { error } = await db.from("marketing_content_reviews").insert({ item_id: itemId, package_version: item.package_version, kind, result, note: n || null, actor_id: userId });
  if (error) throw new Error(error.message);
  await logEvent(db, itemId, `review_${kind}_${result}`, userId, n || null);
  return { ok: true };
}

/** Hand the article to the Classroom CMS as a draft. Publishing is blocked there until this item is approved. */
export async function toArticle(userId: string, itemId: string, category: string) {
  const { db } = await ctx(userId);
  const { data: item } = await db.from("marketing_content_items").select("*").eq("id", itemId).single();
  if (item?.article_id) throw new Error("This item already has a Classroom article.");
  const { data: pkg } = await db.from("marketing_content_packages").select("package").eq("item_id", itemId).eq("version", item?.package_version ?? 0).maybeSingle();
  if (!pkg) throw new Error("No package yet.");
  const p = pkg.package as ContentPackage;
  const faq = p.faq.length ? `<h2>Frequently asked questions</h2>${p.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}` : "";
  const cites = p.citations.length ? `<h2>Sources</h2><ul>${p.citations.map((c) => `<li><a href="${esc(c.url)}" rel="noopener">${esc(c.label)}</a></li>`).join("")}</ul>` : "";
  const { draftFromStudio } = await import("@/lib/classroom.server");
  const a = await draftFromStudio(userId, { slug: p.slug, title: p.seo_title, html: p.body_html + faq + cites, metaTitle: p.meta_title, metaDescription: p.meta_description, category });
  await db.from("marketing_content_items").update({ article_id: a.id, article_url: `${SITE}/post/${a.slug}` }).eq("id", itemId);
  await logEvent(db, itemId, "article_draft_created", userId);
  return a;
}

/** Create separate Facebook and Instagram post drafts (different text). Approval is blocked until this item is approved. */
export async function toPosts(userId: string, itemId: string) {
  const { db } = await ctx(userId);
  const { data: item } = await db.from("marketing_content_items").select("*").eq("id", itemId).single();
  const { data: pkg } = await db.from("marketing_content_packages").select("package").eq("item_id", itemId).eq("version", item?.package_version ?? 0).maybeSingle();
  if (!pkg) throw new Error("No package yet.");
  if ((item.post_ids ?? []).length) throw new Error("Post drafts already exist for this item.");
  const p = pkg.package as ContentPackage;
  const { savePost } = await import("@/lib/marketing.server");
  const ids: string[] = [];
  for (const ch of ["facebook", "instagram"] as const) {
    const r = await savePost(userId, { title: `${p.social_headline} — ${ch}`, body: p.social[ch], channels: [ch], imagePaths: [], scheduledAt: null });
    ids.push(r.id);
  }
  await db.from("marketing_content_items").update({ post_ids: ids }).eq("id", itemId);
  await logEvent(db, itemId, "post_drafts_created", userId, "Facebook + Instagram drafts");
  return { ids };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/* ---------- Content Studio: start a package from research, an idea, a calendar item or a manual topic ---------- */
const LOCKED = ["approved", "scheduled", "published", "performance_review"];

export async function studioSources(userId: string) {
  const { db, roles } = await ctx(userId);
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [stories, ideas, items, series] = await Promise.all([
    db.from("marketing_research_stories").select("id, headline, publisher, url, published_at, score, verification_status, suggested_series, category")
      .is("dismissed_at", null).eq("promoted", true).eq("verification_status", "verified_primary").gte("retrieved_at", since).order("score", { ascending: false }).limit(60),
    db.from("marketing_research_ideas").select("id, series_key, title, angle, unverified_claims, idea_date").is("converted_item_id", null).gte("idea_date", since.slice(0, 10)).order("created_at", { ascending: false }).limit(40),
    db.from("marketing_content_items").select("id, series_key, article_title, topic, status, publish_at, package_version").not("status", "in", `(${LOCKED.join(",")})`).order("updated_at", { ascending: false }).limit(40),
    db.from("marketing_series").select("key, name, weekday").eq("active", true).order("weekday"),
  ]);
  const { STUDIO_MANAGERS } = await import("@/lib/marketing-studio-model");
  return { stories: stories.data ?? [], ideas: ideas.data ?? [], items: items.data ?? [], series: series.data ?? [], canManualTopic: roles.some((r) => STUDIO_MANAGERS.includes(r)) };
}

type Start =
  | { kind: "stories"; story_ids: string[]; series_key: string; guidance: string | null }
  | { kind: "idea"; idea_id: string; guidance: string | null }
  | { kind: "item"; item_id: string; guidance: string | null }
  | { kind: "manual"; series_key: string; title: string; topic: string; source_urls: string[]; guidance: string | null };

/** Returns the Studio item the draft package belongs to. Never approves, schedules or publishes. */
export async function startPackage(userId: string, s: Start) {
  const { db, roles } = await ctx(userId);
  const studio = await import("@/lib/marketing-studio.server");
  let itemId: string;
  if (s.kind === "item") {
    itemId = s.item_id;
  } else if (s.kind === "idea") {
    const { data: idea } = await db.from("marketing_research_ideas").select("converted_item_id").eq("id", s.idea_id).single();
    if (!idea) throw new Error("Idea not found.");
    itemId = idea.converted_item_id ?? (await (await import("@/lib/marketing-research.server")).convertIdea(userId, s.idea_id, null)).id;
  } else if (s.kind === "stories") {
    if (!s.story_ids.length) throw new Error("Pick at least one story.");
    const { data: st } = await db.from("marketing_research_stories").select("id, headline, url, primary_source_urls, verification_status, keywords, angle, facts").in("id", s.story_ids);
    const list = (st ?? []) as any[];
    if (list.some((x) => x.verification_status !== "verified_primary")) throw new Error("Only stories verified against a primary source can start a package.");
    const urls = [...new Set(list.flatMap((x) => [...(x.primary_source_urls ?? []), x.url]))].slice(0, 30) as string[];
    // Duplicate prevention: an open item already built on exactly these stories is reused.
    const { data: open } = await db.from("marketing_content_items").select("id, source_urls, status").eq("series_key", s.series_key).not("status", "in", `(${LOCKED.join(",")})`).overlaps("source_urls", list.map((x) => x.url));
    const same = ((open ?? []) as any[]).find((o) => list.every((x) => (o.source_urls ?? []).includes(x.url)));
    if (same) return { itemId: same.id, existing: true, version: null };
    const item = await studio.saveItem(userId, {
      series_key: s.series_key, article_title: list[0].headline, topic: list.length > 1 ? `Grouped stories: ${list.map((x) => x.headline).join(" · ")}`.slice(0, 500) : (list[0].angle ?? "").slice(0, 500),
      keywords: [...new Set(list.flatMap((x) => x.keywords ?? []))].slice(0, 15), source_urls: urls, platforms: ["linkedin", "website"],
    });
    const cites = list.flatMap((x) => ((x.facts ?? []) as any[]).slice(0, 6).map((f) => ({ item_id: item.id, story_id: x.id, claim: typeof f === "string" ? f : JSON.stringify(f), claim_kind: "fact", source_url: (x.primary_source_urls ?? [])[0] ?? x.url, verification: "verified_primary", created_by: userId })));
    if (cites.length) await db.from("marketing_content_citations").insert(cites);
    itemId = item.id;
  } else {
    const { STUDIO_MANAGERS } = await import("@/lib/marketing-studio-model");
    if (!roles.some((r) => STUDIO_MANAGERS.includes(r))) throw new Error("Only a marketing manager can approve a manual topic.");
    if (!s.source_urls.length) throw new Error("Add at least one primary source link for a manual topic.");
    const item = await studio.saveItem(userId, { series_key: s.series_key, article_title: s.title, topic: s.topic, source_urls: s.source_urls, platforms: ["linkedin", "website"] });
    await logEvent(db, item.id, "manual_topic_approved", userId, "Topic entered and approved by a marketing manager");
    itemId = item.id;
  }
  const r = await generate(userId, itemId, s.guidance);
  return { itemId, existing: false, version: r.version };
}

/* ---------- Topical authority dashboard ---------- */
export async function clusterDashboard(userId: string) {
  const { db } = await ctx(userId);
  const { CLUSTERS, clustersFor } = await import("@/lib/marketing-seo-model");
  const pages = (await sitePages(db)).filter((p) => p.kind === "article");
  const { data: items } = await db.from("marketing_content_items").select("id, article_title, topic, status, series_key, keywords").limit(500);
  const { data: ideas } = await db.from("marketing_research_ideas").select("title, angle, series_key").is("converted_item_id", null).limit(200);
  return CLUSTERS.map((c) => ({
    key: c.key, label: c.label,
    published: pages.filter((p) => p.published && clustersFor(p.title).includes(c.key)).map((p) => ({ title: p.title, url: p.url })),
    unpublished: pages.filter((p) => !p.published && clustersFor(p.title).includes(c.key)).map((p) => ({ title: p.title, url: p.url })),
    drafts: ((items ?? []) as any[]).filter((i) => clustersFor(`${i.article_title ?? ""} ${i.topic ?? ""} ${(i.keywords ?? []).join(" ")}`).includes(c.key)).map((i) => ({ id: i.id, title: i.article_title || i.topic, status: i.status })),
    suggestions: ((ideas ?? []) as any[]).filter((i) => clustersFor(`${i.title} ${i.angle}`).includes(c.key)).slice(0, 5).map((i) => i.title),
  }));
}
