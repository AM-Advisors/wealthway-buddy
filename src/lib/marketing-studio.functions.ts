import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { STUDIO_STATUSES } from "@/lib/marketing-studio-model";

const srv = () => import("@/lib/marketing-studio.server");
const uuidish = z.string().uuid().nullable().optional().or(z.literal(""));
const item = z.object({
  id: z.string().uuid().nullish(),
  series_key: z.string().max(60).optional(),
  publish_at: z.string().datetime().nullable().optional(),
  article_title: z.string().max(300).optional(),
  social_headline: z.string().max(300).optional(),
  topic: z.string().max(500).optional(),
  audience: z.string().max(300).optional(),
  keywords: z.array(z.string().max(80)).max(30).optional(),
  source_urls: z.array(z.string().url().max(2000)).max(30).optional(),
  author_id: uuidish, reviewer_id: uuidish, campaign_id: uuidish, post_id: uuidish, article_id: uuidish, email_id: uuidish,
  platforms: z.array(z.enum(["linkedin", "facebook", "instagram", "website", "email"])).max(5).optional(),
  graphic_requirements: z.string().max(2000).optional(),
  article_url: z.string().max(2000).optional(),
  cta: z.string().max(300).optional(),
  metrics: z.record(z.string(), z.number()).optional(),
});

export const getStudio = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).overview(context.userId, data.from, data.to));
export const getStudioItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).getItem(context.userId, data.id));
export const saveStudioItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => item.parse(d))
  .handler(async ({ data, context }) => (await srv()).saveItem(context.userId, data as any));
export const moveStudioItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), to: z.enum(STUDIO_STATUSES), note: z.string().max(1000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).moveItem(context.userId, data.id, data.to, data.note));
export const duplicateStudioItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).duplicateItem(context.userId, data.id));
export const commentStudioItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), body: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).comment(context.userId, data.id, data.body));
export const planStudioWeek = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).planWeek(context.userId, data.week));
export const getStudioSignals = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).dashboardSignals(context.userId));
