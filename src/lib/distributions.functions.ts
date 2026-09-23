/**
 * Phase D server-function surface. Every handler re-resolves the signed-in
 * person's authority from authoritative records; nothing trusts the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { DestinationFields, DistributionType } from "@/lib/distributions-model";

const authed = () => createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]);

// --------------------------------------------------------- destinations

export const requestPaymentInstructionFn = authed()
  .inputValidator(
    (input: {
      investorUserId?: string | null;
      investmentProfileId?: string | null;
      offeringId?: string | null;
      destination: DestinationFields;
      label?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { requestPaymentInstruction } = await import("@/lib/distributions.server");
    return requestPaymentInstruction(context.userId, data);
  });

export const recordInstructionStepUpFn = authed()
  .inputValidator((input: { changeId: string; method: string }) => input)
  .handler(async ({ data, context }) => {
    const { recordInstructionStepUp } = await import("@/lib/distributions.server");
    return recordInstructionStepUp(context.userId, data.changeId, data.method);
  });

export const verifyPaymentInstructionFn = authed()
  .inputValidator(
    (input: { changeId: string; method: string; independentNoticeChannel: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const { verifyPaymentInstruction } = await import("@/lib/distributions.server");
    return verifyPaymentInstruction(context.userId, data);
  });

export const reviewPaymentInstructionFn = authed()
  .inputValidator((input: { changeId: string }) => input)
  .handler(async ({ data, context }) => {
    const { reviewPaymentInstruction } = await import("@/lib/distributions.server");
    return reviewPaymentInstruction(context.userId, data.changeId);
  });

export const approvePaymentInstructionFn = authed()
  .inputValidator(
    (input: { changeId: string; waiveCoolingOff?: boolean; waiverReason?: string | null }) => input,
  )
  .handler(async ({ data, context }) => {
    const { approvePaymentInstruction } = await import("@/lib/distributions.server");
    return approvePaymentInstruction(context.userId, data);
  });

export const myPaymentInstructionsFn = authed()
  .handler(async ({ context }) => {
    const { myPaymentInstructions } = await import("@/lib/distributions.server");
    return myPaymentInstructions(context.userId);
  });

// ------------------------------------------------------------- batches

export const proposeDistributionFn = authed()
  .inputValidator(
    (input: {
      offeringId: string;
      distributionType: DistributionType;
      declaredAmountCents: number;
      reserveCents?: number;
      title?: string | null;
      purpose?: string | null;
      sourceProceeds?: string | null;
      recordDate?: string | null;
      effectiveDate?: string | null;
      paymentDate?: string | null;
      allocationRunId?: string | null;
      useWaterfall?: boolean;
      investorConfirmationRequired?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { proposeDistribution } = await import("@/lib/distributions.server");
    return proposeDistribution(context.userId, data);
  });

export const requestDistributionFn = authed()
  .inputValidator((input: { batchId: string }) => input)
  .handler(async ({ data, context }) => {
    const { requestDistribution } = await import("@/lib/distributions.server");
    return requestDistribution(context.userId, data.batchId);
  });

export const reviewDistributionFn = authed()
  .inputValidator((input: { batchId: string }) => input)
  .handler(async ({ data, context }) => {
    const { reviewDistribution } = await import("@/lib/distributions.server");
    return reviewDistribution(context.userId, data.batchId);
  });

export const managerApproveDistributionFn = authed()
  .inputValidator((input: { batchId: string }) => input)
  .handler(async ({ data, context }) => {
    const { managerApproveDistribution } = await import("@/lib/distributions.server");
    return managerApproveDistribution(context.userId, data.batchId);
  });

export const investorConfirmDistributionFn = authed()
  .inputValidator((input: { lineId: string }) => input)
  .handler(async ({ data, context }) => {
    const { investorConfirmDistribution } = await import("@/lib/distributions.server");
    return investorConfirmDistribution(context.userId, data.lineId);
  });

export const adjustDistributionLineFn = authed()
  .inputValidator(
    (input: {
      lineId: string;
      newGrossCents: number;
      reason: string;
      evidencePath: string;
      requestedByUserId: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { adjustDistributionLine } = await import("@/lib/distributions.server");
    return adjustDistributionLine(context.userId, data);
  });

export const finalApproveDistributionFn = authed()
  .inputValidator((input: { batchId: string }) => input)
  .handler(async ({ data, context }) => {
    const { finalApproveDistribution } = await import("@/lib/distributions.server");
    return finalApproveDistribution(context.userId, data.batchId);
  });

export const supersedeDistributionFn = authed()
  .inputValidator((input: { batchId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { supersedeDistribution } = await import("@/lib/distributions.server");
    return supersedeDistribution(context.userId, data.batchId, data.reason);
  });

export const cancelDistributionFn = authed()
  .inputValidator((input: { batchId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { cancelDistribution } = await import("@/lib/distributions.server");
    return cancelDistribution(context.userId, data.batchId, data.reason);
  });

// ----------------------------------------------------------- execution

export const distributionExecutionCheckFn = authed()
  .inputValidator((input: { lineId: string }) => input)
  .handler(async ({ data, context }) => {
    const { distributionExecutionCheck } = await import("@/lib/distributions.server");
    return distributionExecutionCheck(context.userId, data.lineId);
  });

export const executeDistributionPaymentFn = authed()
  .inputValidator(
    (input: { lineId: string; externalReference: string; providerPaymentId?: string | null }) => ({
      lineId: String(input.lineId),
      externalReference: String(input.externalReference ?? ""),
      providerPaymentId: input.providerPaymentId ?? null,
      // Recording only: the application never initiates a transfer.
      provider: "manual_bank",
    }),
  )
  .handler(async ({ data, context }) => {
    const { executeDistributionPayment } = await import("@/lib/distributions.server");
    return executeDistributionPayment(context.userId, data);
  });

export const reconcileDistributionPaymentFn = authed()
  .inputValidator((input: { paymentId: string; bankTransactionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { reconcileDistributionPayment } = await import("@/lib/distributions.server");
    return reconcileDistributionPayment(context.userId, data);
  });

export const postDistributionPaymentFn = authed()
  .inputValidator((input: { paymentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { postDistributionPayment } = await import("@/lib/distributions.server");
    return postDistributionPayment(context.userId, data.paymentId);
  });

export const reverseDistributionPaymentFn = authed()
  .inputValidator((input: { paymentId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { reverseDistributionPayment } = await import("@/lib/distributions.server");
    return reverseDistributionPayment(context.userId, data.paymentId, data.reason);
  });

export const approveDistributionReconciliationFn = authed()
  .inputValidator((input: { paymentId: string }) => ({ paymentId: String(input.paymentId) }))
  .handler(async ({ data, context }) => {
    const { approveDistributionReconciliation } = await import("@/lib/distributions.server");
    return approveDistributionReconciliation(context.userId, data.paymentId);
  });

export const approveDistributionReversalFn = authed()
  .inputValidator((input: { paymentId: string }) => ({ paymentId: String(input.paymentId) }))
  .handler(async ({ data, context }) => {
    const { approveDistributionReversal } = await import("@/lib/distributions.server");
    return approveDistributionReversal(context.userId, data.paymentId);
  });

export const reviewDistributionWithholdingFn = authed()
  .inputValidator((input: { batchId: string }) => ({ batchId: String(input.batchId) }))
  .handler(async ({ data, context }) => {
    const { reviewDistributionWithholding } = await import("@/lib/distributions.server");
    return reviewDistributionWithholding(context.userId, data.batchId);
  });

export const reissueDistributionPaymentFn = authed()
  .inputValidator((input: { paymentId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { reissueDistributionPayment } = await import("@/lib/distributions.server");
    return reissueDistributionPayment(context.userId, data.paymentId, data.reason);
  });

export const recordProviderEventFn = authed()
  .inputValidator(
    (input: {
      provider: string;
      providerEventId: string;
      providerPaymentId?: string | null;
      paymentId?: string | null;
      eventType: string;
      reportedAmountCents?: number | null;
      reportedCurrency?: string | null;
      reportedDestinationMasked?: string | null;
      reportedDirection?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { recordProviderEvent } = await import("@/lib/distributions.server");
    const { assertStaffForProviderIntake } = await import("@/lib/distributions.server");
    await assertStaffForProviderIntake(context.userId);
    return recordProviderEvent({ ...data, actorUserId: context.userId });
  });

export const resolveDistributionExceptionFn = authed()
  .inputValidator((input: { exceptionId: string; resolution: string }) => input)
  .handler(async ({ data, context }) => {
    const { resolveDistributionException } = await import("@/lib/distributions.server");
    return resolveDistributionException(context.userId, data);
  });

export const publishDistributionNoticeFn = authed()
  .inputValidator((input: { lineId: string }) => input)
  .handler(async ({ data, context }) => {
    const { publishDistributionNotice } = await import("@/lib/distributions.server");
    return publishDistributionNotice(context.userId, data.lineId);
  });

// --------------------------------------------------------------- views

export const myDistributionsFn = authed()
  .inputValidator((input: { investmentProfileId?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { myDistributions } = await import("@/lib/distributions.server");
    return myDistributions(context.userId, data);
  });

export const distributionForInvestorFn = authed()
  .inputValidator((input: { lineId: string }) => input)
  .handler(async ({ data, context }) => {
    const { distributionForInvestor } = await import("@/lib/distributions.server");
    return distributionForInvestor(context.userId, data.lineId);
  });

export const distributionsWorkspaceFn = authed()
  .inputValidator((input: { offeringId?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { distributionsWorkspace } = await import("@/lib/distributions.server");
    return distributionsWorkspace(context.userId, data.offeringId ?? null);
  });

export const managerDistributionBoardFn = authed()
  .inputValidator((input: { offeringId?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { managerDistributionBoard } = await import("@/lib/distributions.server");
    return managerDistributionBoard(context.userId, data.offeringId ?? null);
  });

export const distributionAuditTrailFn = authed()
  .inputValidator((input: { batchId: string }) => input)
  .handler(async ({ data, context }) => {
    const { distributionAuditTrail } = await import("@/lib/distributions.server");
    return distributionAuditTrail(context.userId, data.batchId);
  });
