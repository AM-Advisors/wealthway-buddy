import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/investor-bulk.server");
const fund = z.object({ fundId: z.string().uuid() });
const ids = z.array(z.string().uuid()).min(1).max(500);

export const bulkSendKycLinksFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ onboardingIds: ids }).parse)
  .handler(async ({ data, context }) => (await srv()).bulkSendKycLinks(context.userId, data.fundId, data.onboardingIds));

export const listInvestorDuplicatesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.parse)
  .handler(async ({ data, context }) => (await srv()).listInvestorDuplicates(context.userId, data.fundId));

export const mergeInvestorsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ keepId: z.string().uuid(), archiveId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse)
  .handler(async ({ data, context }) => (await srv()).mergeInvestors(context.userId, data.fundId, data.keepId, data.archiveId, data.reason));

export const requestMissingInfoFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ onboardingIds: ids }).parse)
  .handler(async ({ data, context }) => (await srv()).requestMissingInfo(context.userId, data.fundId, data.onboardingIds));

export const bulkSetClassFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ onboardingIds: ids, classKey: z.string().trim().min(1).max(100) }).parse)
  .handler(async ({ data, context }) => (await srv()).bulkSetClass(context.userId, data.fundId, data.onboardingIds, data.classKey));
