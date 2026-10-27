import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuthUnverified } from "@/lib/require-auth";

const srv = () => import("@/lib/account-kyc.server");

export const accountKycStatusFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await srv()).reconcileAccountCheck(context.userId));

export const startAccountCheckFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => {
    let origin = "https://app.harmonious.co";
    try { const r = getRequest(); if (r?.url) origin = new URL(r.url).origin; } catch { /* default */ }
    return (await srv()).startAccountCheck(context.userId, origin);
  });

export const accountCheckQueueFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await srv()).accountCheckQueue(context.userId) as Promise<any[]>);

export const decideAccountCheckFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .validator(z.object({ checkId: z.string().uuid(), action: z.enum(["approve", "decline", "send_back"]), note: z.string().max(2000).nullable() }).parse)
  .handler(async ({ data, context }) => (await srv()).decideAccountCheck(context.userId, data.checkId, data.action, data.note));

export const verificationImagesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .validator(z.object({ checkId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).verificationImages(context.userId, data.checkId));

export const backfillReviewDetailsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await srv()).backfillReviewDetails(context.userId));

export const amlMatchReviewFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .validator(z.object({ checkId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).amlMatchReview(context.userId, data.checkId) as Promise<any>);

export const clearAmlMatchesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .validator(z.object({ checkId: z.string().uuid(), keys: z.array(z.string().min(1).max(500)).min(1).max(100), reason: z.string().min(5).max(2000) }).parse)
  .handler(async ({ data, context }) => (await srv()).clearAmlMatches(context.userId, data.checkId, data.keys, data.reason));
