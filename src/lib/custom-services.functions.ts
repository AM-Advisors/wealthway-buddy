import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { CUSTOM_BILLING, CUSTOM_REVIEW_DECISIONS } from "@/lib/custom-service-model";

const S = () => import("@/lib/custom-services.server");
const body = z.object({
  name: z.string().max(200), category: z.string().max(40).nullish(), summary: z.string().max(6000),
  included: z.array(z.string().max(500)).max(40).default([]), excluded: z.array(z.string().max(500)).max(40).default([]),
  billingFrequency: z.enum(CUSTOM_BILLING).default("one_time"), suggestedPriceCents: z.number().int().min(0).max(1_000_000_000).nullish(),
});

export const listCustomServices = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ includeRetired: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await S()).listCustomServices(context.userId, data));

export const createCustomService = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => body.extend({ writtenWith: z.enum(["manual", "ai"]).default("manual") }).parse(d))
  .handler(async ({ data, context }) => (await S()).createCustomService(context.userId, data));

export const updateCustomService = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => body.extend({ id: z.string().uuid(), expectedUpdatedAt: z.string().min(10) }).parse(d))
  .handler(async ({ data, context }) => (await S()).updateCustomService(context.userId, data));

export const reviewCustomService = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), decision: z.enum(CUSTOM_REVIEW_DECISIONS), productTarget: z.string().max(200).nullish(), note: z.string().max(2000).nullish(), expectedUpdatedAt: z.string().min(10) }).parse(d))
  .handler(async ({ data, context }) => (await S()).reviewCustomService(context.userId, data));

export const retireCustomService = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), reason: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => (await S()).retireCustomService(context.userId, data));

export const draftCustomServiceWithAi = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ name: z.string().max(200), brief: z.string().max(6000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).draftCustomServiceWithAi(context.userId, data));
