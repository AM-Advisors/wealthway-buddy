import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Article } from "@/lib/marketing/articles";

/** Public reads of published Classroom articles (anon client, RLS limits to published rows). */
function pub() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const h = new Headers(init?.headers);
      if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
      h.set("apikey", key);
      return fetch(input, { ...init, headers: h });
    } },
  }) as any;
}

function toArticle(a: any, v: any): Article {
  const hero = v.hero_image_url ? { src: v.hero_image_url as string, alt: (v.hero_image_alt as string) || v.title } : undefined;
  return {
    slug: a.slug, originalPath: `/post/${a.slug}`, title: v.title, author: a.author_name ?? undefined,
    publishedAt: a.original_published_at ?? a.published_at, updatedAt: a.published_at ?? undefined,
    ...(hero ? { heroImage: hero } : {}),
    contentHtml: v.content_html, category: a.category,
    metaTitle: v.meta_title ?? undefined, metaDescription: v.meta_description ?? undefined,
    ogImage: hero?.src.startsWith("https://") ? hero.src : undefined,
  };
}

async function load(slug?: string): Promise<Article[]> {
  const db = pub();
  let q = db.from("classroom_articles").select("slug, category, author_name, original_published_at, published_at, published_version_id").eq("status", "published");
  if (slug) q = q.eq("slug", slug);
  const { data: arts } = await q.limit(1000);
  const rows = (arts ?? []) as any[];
  if (!rows.length) return [];
  const { data: vs } = await db.from("classroom_article_versions").select(slug ? "*" : "id, title, hero_image_url, hero_image_alt, meta_title, meta_description").in("id", rows.map((r) => r.published_version_id));
  const vm = new Map(((vs ?? []) as any[]).map((v) => [v.id, v]));
  return rows.filter((r) => vm.has(r.published_version_id)).map((r) => toArticle(r, { content_html: "", ...vm.get(r.published_version_id) }))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export const listPublishedClassroom = createServerFn({ method: "GET" }).handler(async () => load());

export const getPublishedClassroomArticle = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => (await load(data.slug))[0] ?? null);
