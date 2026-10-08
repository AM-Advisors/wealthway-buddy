import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/marketing-research.server");
const id = z.object({ id: z.string().uuid() });

export const getResearchFeed = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).feed(context.userId, data.days));
export const runResearchNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ideas: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).runNow(context.userId, data.ideas));
export const dismissResearchStory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d)).handler(async ({ data, context }) => (await srv()).dismissStory(context.userId, data.id));
export const ackResearchAlert = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d)).handler(async ({ data, context }) => (await srv()).ackAlert(context.userId, data.id));
export const addResearchStory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    source_key: z.string().max(60), headline: z.string().min(5).max(500), url: z.string().url().max(2000),
    published_at: z.string().datetime().nullable(), summary: z.string().max(3000), primary_source_url: z.string().url().max(2000).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).addStory(context.userId, data));
export const convertResearchIdea = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), publish_at: z.string().datetime().nullable() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).convertIdea(context.userId, data.id, data.publish_at));
export const getItemCitations = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d)).handler(async ({ data, context }) => (await srv()).citations(context.userId, data.id));
