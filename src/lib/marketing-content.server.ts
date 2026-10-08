/**
 * Marketing content workspace (server-only). Generates editable, versioned content packages for a Studio item,
 * records append-only reviews, and hands drafts to the existing Classroom CMS and social posts.
 * Nothing here publishes or schedules; the Studio approval gate and each channel's own approval still apply.
 */
import { STUDIO_ACCESS, STUDIO_REVIEWERS, isLocked } from "@/lib/marketing-studio-model";
import { FOUNDER_REVIEW_ROLE, buildSchema, overlapPercent, sanitizePackage, type ContentPackage } from "@/lib/marketing-content-model";
import { aiJson } from "@/lib/marketing-research.server";
import { COPY_RULES } from "@/lib/marketing-brand";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const MODEL = "openai/gpt-6-astra";
const SITE = "https://harmonious.co";

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

async function internalPages(db: any) {
  const { data } = await db.from("classroom_articles").select("slug, current_version_id").eq("status", "published").limit(60);
  const slugs = ((data ?? []) as any[]).map((a) => `${SITE}/post/${a.slug}`);
  return [...slugs, `${SITE}/fund-administration`, `${SITE}/spvs`, `${SITE}/platform`, `${SITE}/pricing`, `${SITE}/data-security`];
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
  return { item, series, packages: pkgs ?? [], reviews: reviews ?? [], sources: src.allowed, stories: src.stories, citations: src.cites, posts: posts ?? [], article, people, roles, me: userId };
}

const S = { type: "string" } as const;
const SA = { type: "array", items: S } as const;
const obj = (props: Record<string, any>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const SCHEMA = obj({
  seo_title: S, social_headline: S, slug: S, meta_title: S, meta_description: S, primary_keyword: S, secondary_keywords: SA, search_intent: S,
  outline: { type: "array", items: obj({ heading: S, points: SA }) }, body_html: S,
  faq: { type: "array", items: obj({ q: S, a: S }) },
  internal_links: { type: "array", items: obj({ label: S, url: S }) },
  citations: { type: "array", items: obj({ label: S, url: S }) }, cta: S,
  social: obj({ linkedin_company: S, linkedin_executive: S, facebook: S, instagram: S, x: S, email_subject: S, email_body: S }),
  graphics: { type: "array", items: obj({ template: { type: "string", enum: ["breaking", "regulatory", "stat", "quote", "carousel", "comparison", "academy", "poll"] }, size: { type: "string", enum: ["square", "portrait", "landscape", "story"] }, headline: S, subhead: S, stat: S, stat_source_url: S, bullets: SA }) },
});

async function nextVersion(db: any, itemId: string) {
  const { data } = await db.from("marketing_content_packages").select("version").eq("item_id", itemId).order("version", { ascending: false }).limit(1);
  return ((data ?? [])[0]?.version ?? 0) + 1;
}
async function store(db: any, item: any, userId: string, p: ContentPackage, ai: boolean, note: string | null) {
  const version = await nextVersion(db, item.id);
  const url = `${SITE}/post/${p.slug}`;
  const final = { ...p, schema_jsonld: buildSchema(p, url, item.series_key === "founders_friday" ? "Alyssa Pettit" : "Harmonious", item.publish_at, new Date().toISOString()) };
  const { error } = await db.from("marketing_content_packages").insert({ item_id: item.id, version, package: final, ai_generated: ai, model: ai ? MODEL : null, note, created_by: userId });
  if (error) throw new Error(error.message);
  await db.from("marketing_content_items").update({ package_version: version, updated_at: new Date().toISOString() }).eq("id", item.id);
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
    founders ? "FOUNDERS FRIDAY: never invent Alyssa's experiences, opinions, quotes or stories. Write questions and [ALYSSA TO ADD] placeholders where her perspective belongs." : "",
    "Use ONLY the facts and numbers in the SOURCE MATERIAL. Never invent statistics, quotes, SEC statements, laws, clients or current events. Label analysis as analysis. No investment, legal or tax advice.",
    "SEO/GEO: question-based H2/H3 headings, a direct factual answer in the first paragraph under each question, accurate definitions, semantic HTML (h2, h3, p, ul, ol, strong) with no scripts or inline styles. Original analysis. Never promise rankings or AI citations.",
    "citations: only URLs from SOURCES. internal_links: only URLs from INTERNAL PAGES, choose 2–5 relevant ones. slug: lowercase-hyphenated.",
    "meta_title ≤ 60 chars, meta_description ≤ 155 chars. FAQ 3–5 items when useful, answers must match the article.",
    "Social: write different text per platform. linkedin_company (professional, 120–200 words, 3 hashtags), linkedin_executive (first person ONLY as framing questions/placeholders for the executive; never invent their opinions), facebook (conversational, 60–120 words), instagram (hook line, short lines, 5–8 hashtags, 'link in bio'), x (≤ 270 chars incl. 1–2 hashtags), email_subject (≤ 60 chars) and email_body (short newsletter blurb with CTA).",
    "Graphics: 2–4 specs using fitting templates and sizes. stat must be copied verbatim from SOURCE MATERIAL with its stat_source_url from SOURCES, or empty string.",
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
