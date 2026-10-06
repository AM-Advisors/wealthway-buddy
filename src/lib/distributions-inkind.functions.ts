import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { DISTRIBUTION_TYPES } from "@/lib/distributions-model";

const authed = () => createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]);
const cents = z.number().int().nonnegative().nullish();

export const setupDistributionFn = authed()
  .inputValidator(z.object({
    offeringId: z.string().uuid(),
    kind: z.enum(["cash", "cash_and_shares", "shares"]),
    distributionType: z.enum(DISTRIBUTION_TYPES),
    title: z.string().max(200).nullish(),
    paymentDate: z.string().nullish(),
    cashCents: cents,
    shareIssuer: z.string().max(200).nullish(),
    shareClass: z.string().max(100).nullish(),
    shareCount: z.number().int().positive().nullish(),
    sharePriceCents: cents,
    shareIsPublic: z.boolean().nullish(),
    shareCustodian: z.string().max(200).nullish(),
    harmoniousFeeCents: cents,
    custodianCostCents: cents,
    feeNote: z.string().max(1000).nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/distributions-inkind.server")).setupDistribution(context.userId, data));

export const fundDistributionsFn = authed()
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/distributions-inkind.server")).fundDistributions(context.userId, data.offeringId));

export const distributionSheetFn = authed()
  .inputValidator(z.object({ batchId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/distributions-inkind.server")).distributionSheet(context.userId, data.batchId));

export const approveDistributionFeeFn = authed()
  .inputValidator(z.object({ batchId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/distributions-inkind.server")).approveDistributionFee(context.userId, data.batchId));

export const setShareDestinationFn = authed()
  .inputValidator(z.object({ lineId: z.string().uuid(), destination: z.string().max(300) }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/distributions-inkind.server")).setShareDestination(context.userId, data.lineId, data.destination));

export const distributionBankFileFn = authed()
  .inputValidator(z.object({ batchId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/distributions-inkind.server")).distributionBankFile(context.userId, data.batchId));

export const recordShareTransferFn = authed()
  .inputValidator(z.object({ lineId: z.string().uuid(), event: z.enum(["instructed", "confirmed", "failed"]), confirmationRef: z.string().max(200).nullish(), note: z.string().max(1000).nullish() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/distributions-inkind.server")).recordShareTransfer(context.userId, data));
