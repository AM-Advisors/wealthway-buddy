import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/classroom.server");
const id = z.object({ id: z.string().uuid() });

export const listClassroom = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listArticles(context.userId));

export const getClassroomArticle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d))
  .handler(async ({ data, context }) => (await srv()).getArticle(context.userId, data.id));

export const importClassroomBatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slugs: z.array(z.string().max(200)).min(1).max(5) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).importBatch(context.userId, data.slugs));

export const saveClassroomEdit = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(), title: z.string().max(300), contentHtml: z.string().max(200000),
    heroImageUrl: z.string().max(2000).nullable(), heroImageAlt: z.string().max(300).nullable(),
    metaTitle: z.string().max(200).nullable(), metaDescription: z.string().max(400).nullable(), category: z.string().max(60),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveEdit(context.userId, data));

export const publishClassroomArticle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), publish: z.boolean(), versionId: z.string().uuid().nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).setPublished(context.userId, data.id, data.publish, data.versionId));

export const refreshClassroomArticle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), guidance: z.string().max(2000).nullable(), withImage: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).aiRefresh(context.userId, data.id, data.guidance, data.withImage));

export const newClassroomArticle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ topic: z.string().trim().min(5).max(500), audience: z.string().max(300).nullable(), points: z.string().max(3000).nullable(), category: z.string().max(60), slug: z.string().max(120) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).aiNew(context.userId, data));

export const newClassroomImage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), theme: z.string().max(400) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).newImage(context.userId, data.id, data.theme));
