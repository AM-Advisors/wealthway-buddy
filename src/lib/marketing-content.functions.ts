import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { REVIEW_KINDS } from "@/lib/marketing-content-model";

const srv = () => import("@/lib/marketing-content.server");
const id = z.object({ id: z.string().uuid() });
const s = (n: number) => z.string().max(n);
const pkg = z.object({
  seo_title: s(300), social_headline: s(300), slug: s(120), meta_title: s(120), meta_description: s(400),
  primary_keyword: s(120), secondary_keywords: z.array(s(120)).max(20), search_intent: s(300),
  outline: z.array(z.object({ heading: s(300), points: z.array(s(500)).max(20) })).max(30),
  body_html: s(100_000), faq: z.array(z.object({ q: s(500), a: s(2000) })).max(15),
  internal_links: z.array(z.object({ label: s(300), url: s(2000) })).max(20),
  citations: z.array(z.object({ label: s(300), url: s(2000) })).max(40),
  schema_jsonld: s(20_000), cta: s(500), cta_options: z.array(s(500)).max(5).optional(),
  claims: z.array(z.object({ text: s(2000), kind: z.enum(["fact", "analysis", "opinion", "projection", "hypothetical"]), source_url: s(2000), verification: z.enum(["sourced", "unverified", "not_applicable"]).optional() })).max(60).optional(),
  social: z.object({ linkedin_company: s(3000), linkedin_executive: s(3000), facebook: s(3000), instagram: s(2200), x: s(280), email_subject: s(200), email_body: s(5000) }),
  graphics: z.array(z.object({ template: s(40), size: s(20), headline: s(300), subhead: s(500), stat: s(120), stat_source_url: s(2000), bullets: z.array(s(300)).max(10), stat_unverified: z.boolean().optional() })).max(10),
});

export const getContentWorkspace = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d)).handler(async ({ data, context }) => (await srv()).workspace(context.userId, data.id));
export const generateContentPackage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), guidance: s(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).generate(context.userId, data.id, data.guidance ?? null));
export const saveContentPackage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), package: pkg, note: s(500).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).save(context.userId, data.id, data.package as any, data.note ?? null));
export const checkOriginality = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d)).handler(async ({ data, context }) => (await srv()).originality(context.userId, data.id));
export const recordContentReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), kind: z.enum(REVIEW_KINDS), result: z.enum(["pass", "fail"]), note: s(1000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).review(context.userId, data.id, data.kind, data.result, data.note ?? null));
export const contentToArticle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), category: s(60) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).toArticle(context.userId, data.id, data.category));
export const contentToPosts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d)).handler(async ({ data, context }) => (await srv()).toPosts(context.userId, data.id));

export const getContentStudioSources = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).studioSources(context.userId));
const g = z.string().max(1000).nullable();
export const startContentPackage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("stories"), story_ids: z.array(z.string().uuid()).min(1).max(8), series_key: z.string().max(60), guidance: g }),
    z.object({ kind: z.literal("idea"), idea_id: z.string().uuid(), guidance: g }),
    z.object({ kind: z.literal("item"), item_id: z.string().uuid(), guidance: g }),
    z.object({ kind: z.literal("manual"), series_key: z.string().max(60), title: z.string().min(3).max(300), topic: z.string().max(500), source_urls: z.array(z.string().url().max(2000)).min(1).max(10), guidance: g }),
  ]).parse(d))
  .handler(async ({ data, context }) => (await srv()).startPackage(context.userId, data as any));
