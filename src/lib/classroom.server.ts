/**
 * Harmonious Classroom: import from the live Wix site, versioned drafts, AI versions, publish.
 * Server-only. Every action re-checks Marketing access. Versions and events are append-only;
 * the author publishes directly (no second approval, by owner choice).
 */
import { requireMarketing } from "@/lib/marketing.server";
import { generateImage } from "@/lib/marketing-ai.server";
import { COPY_RULES } from "@/lib/marketing-brand";
import { guessCategory, parseWixPost, sanitizeHtml } from "@/lib/classroom-html";
import { WIX_CATEGORY_MAP } from "@/lib/marketing/articles";
import { WIX_ARTICLE_SLUGS } from "@/lib/marketing/wix-url-map";
import { RESOURCE_CATEGORIES } from "@/lib/marketing/site-config";

const BUCKET = "classroom-images";
const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const TEXT_MODEL = "openai/gpt-6-astra";
const CATS = RESOURCE_CATEGORIES.map((c) => c.slug as string);

async function event(db: any, article_id: string, action: string, actor_id: string, version_id?: string | null, note?: string | null) {
  await db.from("classroom_article_events").insert({ article_id, action, actor_id, version_id: version_id ?? null, note: note ?? null });
}

async function addVersion(db: any, articleId: string, userId: string, v: {
  title: string; content_html: string; hero_image_url?: string | null; hero_image_alt?: string | null;
  meta_title?: string | null; meta_description?: string | null; source: string; note?: string | null;
}) {
  const { data: last } = await db.from("classroom_article_versions").select("version").eq("article_id", articleId).order("version", { ascending: false }).limit(1);
  const version = ((last ?? [])[0]?.version ?? 0) + 1;
  const { data, error } = await db.from("classroom_article_versions").insert({
    article_id: articleId, version, title: v.title.slice(0, 300), content_html: sanitizeHtml(v.content_html),
    hero_image_url: v.hero_image_url ?? null, hero_image_alt: v.hero_image_alt ?? null,
    meta_title: v.meta_title ?? null, meta_description: v.meta_description ?? null,
    source: v.source, note: v.note ?? null, created_by: userId,
  }).select("id, version").single();
  if (error) throw new Error(error.message);
  await db.from("classroom_articles").update({ current_version_id: data.id, updated_at: new Date().toISOString() }).eq("id", articleId);
  return data as { id: string; version: number };
}

/* ---------- list / get ---------- */
export async function listArticles(userId: string) {
  const { db } = await requireMarketing(userId);
  const { data: arts } = await db.from("classroom_articles").select("*").order("updated_at", { ascending: false }).limit(1000);
  const rows = (arts ?? []) as any[];
  const ids = rows.map((r) => r.current_version_id).filter(Boolean);
  const { data: vs } = ids.length ? await db.from("classroom_article_versions").select("id, title, hero_image_url, version, source").in("id", ids) : { data: [] };
  const vm = new Map(((vs ?? []) as any[]).map((v) => [v.id, v]));
  const have = new Set(rows.map((r) => r.slug));
  return {
    articles: rows.map((r) => {
      const v = vm.get(r.current_version_id) as any;
      return { ...r, title: v?.title ?? r.slug, hero_image_url: v?.hero_image_url ?? null, version: v?.version ?? 0, has_unpublished_changes: r.status === "published" && r.current_version_id !== r.published_version_id };
    }),
    notImported: WIX_ARTICLE_SLUGS.filter((s) => !have.has(s)),
    totalWix: WIX_ARTICLE_SLUGS.length,
  };
}

export async function getArticle(userId: string, id: string) {
  const { db } = await requireMarketing(userId);
  const { data: a } = await db.from("classroom_articles").select("*").eq("id", id).maybeSingle();
  if (!a) throw new Error("Article not found.");
  const [{ data: versions }, { data: events }] = await Promise.all([
    db.from("classroom_article_versions").select("*").eq("article_id", id).order("version", { ascending: false }),
    db.from("classroom_article_events").select("*").eq("article_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  const ids = [...new Set([...((versions ?? []) as any[]).map((v) => v.created_by), ...((events ?? []) as any[]).map((e) => e.actor_id)].filter(Boolean))];
  const { data: profs } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const n = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
  return {
    article: a,
    versions: ((versions ?? []) as any[]).map((v) => ({ ...v, created_by_name: n.get(v.created_by) ?? (v.source === "import" ? "Imported" : "") })),
    events: ((events ?? []) as any[]).map((e) => ({ ...e, actor_name: n.get(e.actor_id) ?? "" })),
  };
}

/* ---------- import from www.harmonious.co ---------- */
export async function importBatch(userId: string, slugs: string[]) {
  const { db } = await requireMarketing(userId);
  const results: { slug: string; ok: boolean; message: string }[] = [];
  for (const slug of slugs.slice(0, 5)) {
    if (!(WIX_ARTICLE_SLUGS as readonly string[]).includes(slug)) { results.push({ slug, ok: false, message: "Not a known Classroom address." }); continue; }
    try {
      const { data: existing } = await db.from("classroom_articles").select("id").eq("slug", slug).maybeSingle();
      if (existing) { results.push({ slug, ok: true, message: "Already imported - left unchanged." }); continue; }
      const res = await fetch(`https://www.harmonious.co/post/${slug}`, { headers: { "User-Agent": "Mozilla/5.0 HarmoniousClassroomImport" } });
      if (!res.ok) throw new Error(`The live page returned ${res.status}.`);
      const p = parseWixPost(await res.text());
      if (!p) throw new Error("Couldn't find the article text on the live page.");
      const { data: art, error } = await db.from("classroom_articles").insert({
        slug, source: "wix", original_path: `/post/${slug}`, status: "draft",
        category: guessCategory(slug, p.wixCategory, WIX_CATEGORY_MAP), author_name: p.author,
        original_published_at: p.publishedAt, created_by: userId,
      }).select("id").single();
      if (error) throw new Error(error.message);
      const v = await addVersion(db, art.id, userId, {
        title: p.title, content_html: p.contentHtml, hero_image_url: p.heroImage, hero_image_alt: p.heroAlt,
        meta_title: p.metaTitle, meta_description: p.metaDescription?.slice(0, 320) ?? null, source: "import", note: "Copied from www.harmonious.co",
      });
      await event(db, art.id, "imported", userId, v.id);
      results.push({ slug, ok: true, message: "Imported as a draft." });
    } catch (e) {
      results.push({ slug, ok: false, message: e instanceof Error ? e.message : "Import failed." });
    }
  }
  return { results };
}

/* ---------- edit ---------- */
export async function saveEdit(userId: string, d: { id: string; title: string; contentHtml: string; heroImageUrl: string | null; heroImageAlt: string | null; metaTitle: string | null; metaDescription: string | null; category: string }) {
  const { db } = await requireMarketing(userId);
  if (!CATS.includes(d.category)) throw new Error("Pick a valid category.");
  if (!d.title.trim() || !d.contentHtml.trim()) throw new Error("Title and article text are required.");
  await db.from("classroom_articles").update({ category: d.category }).eq("id", d.id);
  const v = await addVersion(db, d.id, userId, { title: d.title, content_html: d.contentHtml, hero_image_url: d.heroImageUrl, hero_image_alt: d.heroImageAlt, meta_title: d.metaTitle, meta_description: d.metaDescription, source: "edit" });
  await event(db, d.id, "edited", userId, v.id);
  return v;
}

/* ---------- publish ---------- */
export async function setPublished(userId: string, id: string, publish: boolean, versionId?: string | null) {
  const { db } = await requireMarketing(userId);
  const { data: a } = await db.from("classroom_articles").select("*").eq("id", id).maybeSingle();
  if (!a) throw new Error("Article not found.");
  if (publish) {
    const vid = versionId ?? a.current_version_id;
    const { data: v } = await db.from("classroom_article_versions").select("id, title, content_html").eq("id", vid).eq("article_id", id).maybeSingle();
    if (!v || !v.title.trim() || !v.content_html.trim()) throw new Error("This version has no title or text yet.");
    await db.from("classroom_articles").update({ status: "published", published_version_id: v.id, published_at: new Date().toISOString(), published_by: userId, updated_at: new Date().toISOString() }).eq("id", id);
    await event(db, id, "published", userId, v.id);
  } else {
    await db.from("classroom_articles").update({ status: "unpublished", updated_at: new Date().toISOString() }).eq("id", id);
    await event(db, id, "unpublished", userId, a.published_version_id);
  }
  return { ok: true };
}

/* ---------- AI ---------- */
const VOICE = "You write educational Classroom articles for Harmonious (harmonious.co), a fund administration and back-office platform for venture funds, SPVs, cap tables and their investors. Voice: clear, practical, warm, professional. No hype, no emojis, no investment, legal or tax advice, no guaranteed outcomes, no invented statistics, clients, quotes or laws. Where rules may have changed since the source was written, say readers should confirm current requirements with their advisers. " + COPY_RULES;

async function aiArticle(input: string, task: string) {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("AI isn't configured.");
  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL, reasoning: { effort: "low" },
      instructions: `${VOICE}\n${task}\nhtml: the article body only, using <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote> and <a href> only; no <h1>, no title, no images. 700-1400 words. meta_title: under 60 characters. meta_description: under 155 characters. image_theme: one sentence describing an abstract visual theme for the hero image, no text.`,
      input,
      text: { format: { type: "json_schema", name: "article", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["title", "meta_title", "meta_description", "html", "image_theme"],
        properties: { title: { type: "string" }, meta_title: { type: "string" }, meta_description: { type: "string" }, html: { type: "string" }, image_theme: { type: "string" } },
      } } },
    }),
  });
  if (!res.ok) {
    console.error("classroom AI failed", res.status, await res.text().catch(() => ""));
    if (res.status === 429) throw new Error("The AI helper is busy. Try again in a minute.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in Settings → Plans & credits.");
    throw new Error(`AI request failed [${res.status}].`);
  }
  const j: any = await res.json();
  const raw = String(j?.output_text ?? (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join(""));
  try { return JSON.parse(raw) as { title: string; meta_title: string; meta_description: string; html: string; image_theme: string }; }
  catch { throw new Error("The AI helper returned nothing usable."); }
}

async function heroImage(db: any, userId: string, theme: string) {
  const img = await generateImage(`Wide 16:9 editorial blog header illustration for a fund administration article. Absolutely no text, letters, numbers or logos. Navy and cyan palette, calm institutional style. Theme: ${theme.slice(0, 400)}`);
  const path = `${userId}/${crypto.randomUUID()}.${img.contentType.includes("jpeg") ? "jpg" : "png"}`;
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(img.base64, "base64"), { contentType: img.contentType });
  if (error) throw new Error(error.message);
  return `/classroom-img/${path}`;
}

export async function aiRefresh(userId: string, id: string, guidance: string | null, withImage: boolean) {
  const { db } = await requireMarketing(userId);
  const { data: a } = await db.from("classroom_articles").select("current_version_id").eq("id", id).maybeSingle();
  if (!a) throw new Error("Article not found.");
  const { data: cur } = await db.from("classroom_article_versions").select("*").eq("id", a.current_version_id).maybeSingle();
  if (!cur) throw new Error("This article has no text to refresh.");
  const o = await aiArticle(`Current title: ${cur.title}\n\nCurrent article HTML:\n${String(cur.content_html).slice(0, 20000)}${guidance ? `\n\nEditor guidance: ${guidance}` : ""}`,
    "Write a refreshed version of this existing article: keep its topic, facts and structure where still sound, tighten the writing, improve headings and readability. Do not add facts that are not in the source.");
  const hero = withImage ? await heroImage(db, userId, o.image_theme) : cur.hero_image_url;
  const v = await addVersion(db, id, userId, { title: o.title, content_html: o.html, hero_image_url: hero, hero_image_alt: withImage ? o.title : cur.hero_image_alt, meta_title: o.meta_title, meta_description: o.meta_description, source: "ai_refresh", note: guidance });
  await event(db, id, "ai_refresh", userId, v.id);
  return v;
}

export async function aiNew(userId: string, d: { topic: string; audience: string | null; points: string | null; category: string; slug: string }) {
  const { db } = await requireMarketing(userId);
  if (!CATS.includes(d.category)) throw new Error("Pick a valid category.");
  if (!/^[a-z0-9-]{3,120}$/.test(d.slug)) throw new Error("Web address must be lowercase letters, numbers and hyphens.");
  const { data: clash } = await db.from("classroom_articles").select("id").eq("slug", d.slug).maybeSingle();
  if (clash || (WIX_ARTICLE_SLUGS as readonly string[]).includes(d.slug)) throw new Error("That web address is already used by another article.");
  const o = await aiArticle(`Topic: ${d.topic}\nAudience: ${d.audience || "fund managers and founders"}\nKey points to cover: ${d.points || "(writer's choice)"}`, "Write a new educational article on this topic.");
  const { data: art, error } = await db.from("classroom_articles").insert({ slug: d.slug, source: "new", category: d.category, status: "draft", created_by: userId, original_path: `/post/${d.slug}` }).select("id").single();
  if (error) throw new Error(error.message);
  const hero = await heroImage(db, userId, o.image_theme).catch(() => null);
  const v = await addVersion(db, art.id, userId, { title: o.title, content_html: o.html, hero_image_url: hero, hero_image_alt: o.title, meta_title: o.meta_title, meta_description: o.meta_description, source: "ai_new", note: d.topic });
  await event(db, art.id, "ai_new", userId, v.id);
  return { id: art.id as string };
}

export async function newImage(userId: string, id: string, theme: string) {
  const { db } = await requireMarketing(userId);
  const { data: a } = await db.from("classroom_articles").select("current_version_id").eq("id", id).maybeSingle();
  const { data: cur } = a ? await db.from("classroom_article_versions").select("*").eq("id", a.current_version_id).maybeSingle() : { data: null };
  if (!cur) throw new Error("Article not found.");
  const hero = await heroImage(db, userId, theme || cur.title);
  const v = await addVersion(db, id, userId, { ...cur, hero_image_url: hero, hero_image_alt: cur.title, source: "edit", note: "New AI image" });
  await event(db, id, "new_image", userId, v.id);
  return v;
}
