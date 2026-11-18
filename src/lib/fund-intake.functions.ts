import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/fund-intake.server");
const uuid = z.string().uuid();

export const startFundIntakeFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid, links: z.array(z.string().trim().max(500)).min(1).max(5) }).parse)
  .handler(async ({ data, context }) => (await srv()).startFundIntake(context.userId, data));
export const readFundIntakeBatchFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ runId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).readFundIntakeBatch(context.userId, data.runId));
export const fundIntakeReviewFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ runId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).fundIntakeReview(context.userId, data.runId));
export const listFundIntakeRunsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).listFundIntakeRuns(context.userId, data.offeringId));
export const setFundIntakeSortFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fileId: uuid, sort: z.enum(["fund", "investor", "skip"]) }).parse)
  .handler(async ({ data, context }) => (await srv()).setFundIntakeSort(context.userId, data));
export const saveFundIntakeDocumentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fileId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).saveFundIntakeDocument(context.userId, data));
export const applyFundIntakeInvestorFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ runId: uuid, key: z.string().min(1).max(300), action: z.enum(["add", "match", "skip"]), onboardingId: uuid.nullish(), profileType: z.enum(["individual", "trust", "entity"]).nullish(), legalName: z.string().trim().max(200).nullish(), confirmedNew: z.boolean().optional() }).parse)
  .handler(async ({ data, context }) => (await srv()).applyFundIntakeInvestor(context.userId, data));
