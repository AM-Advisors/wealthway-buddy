/**
 * Phase C authenticated server-function surface.
 *
 * Every handler re-resolves authority inside the engine from the signed-in
 * user. No fund id, profile id, investment id, amount or funding state
 * supplied by the browser is trusted.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const engine = () => import("@/lib/capital-calls.server");

const callId = z.object({ callId: z.string().min(1) });
const lineId = z.object({ lineId: z.string().min(1) });

// ------------------------------------------------------------ capital calls

export const prepareCapitalCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: z.string().min(1),
      callType: z.enum(["whole_fund", "investor_specific"]),
      basis: z.enum(["percentage_of_commitment", "fixed_amount"]),
      percentageBps: z.number().int().nullish(),
      fixedAmountCents: z.number().int().nullish(),
      noticeDate: z.string().nullish(),
      dueDate: z.string().nullish(),
      purpose: z.string().nullish(),
      title: z.string().nullish(),
      includeOnly: z.array(z.string()).nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).prepareCapitalCall(context.userId, {
      offeringId: data.offeringId,
      callType: data.callType,
      basis: data.basis,
      percentageBps: data.percentageBps ?? null,
      fixedAmountCents: data.fixedAmountCents ?? null,
      noticeDate: data.noticeDate ?? null,
      dueDate: data.dueDate ?? null,
      purpose: data.purpose ?? null,
      title: data.title ?? null,
      includeOnly: data.includeOnly ?? null,
    }),
  );

export const requestCapitalCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(callId.parse)
  .handler(async ({ data, context }) => (await engine()).requestCapitalCall(context.userId, data.callId));

export const reviewCapitalCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(callId.parse)
  .handler(async ({ data, context }) => (await engine()).reviewCapitalCall(context.userId, data.callId));

export const publishCapitalCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(callId.parse)
  .handler(async ({ data, context }) => (await engine()).publishCapitalCall(context.userId, data.callId));

export const supersedeCapitalCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ callId: z.string().min(1), reason: z.string().min(4) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).superseteCapitalCall(context.userId, data.callId, data.reason),
  );

export const cancelCapitalCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ callId: z.string().min(1), reason: z.string().min(4) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).cancelCapitalCall(context.userId, data.callId, data.reason),
  );

export const capitalCallBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().nullish() }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).capitalCallBoard(context.userId, data.offeringId ?? null),
  );

// -------------------------------------------------- funding instructions

export const draftFundingInstructionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: z.string().min(1),
      details: z.record(z.string(), z.any()),
      bankName: z.string().nullish(),
      effectiveDate: z.string().nullish(),
      changeReason: z.string().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).draftFundingInstructions(context.userId, {
      offeringId: data.offeringId,
      details: data.details,
      bankName: data.bankName ?? null,
      effectiveDate: data.effectiveDate ?? null,
      changeReason: data.changeReason ?? null,
    }),
  );

export const releaseFundingInstructionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ versionId: z.string().min(1) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).releaseFundingInstructions(context.userId, data.versionId),
  );

export const revokeFundingInstructionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ versionId: z.string().min(1), reason: z.string().min(4) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).revokeFundingInstructions(context.userId, data.versionId, data.reason),
  );

export const fundingInstructionHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().min(1) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).listFundingInstructionVersions(context.userId, data.offeringId),
  );

// ---------------------------------------------------------- investor views

export const myCapitalCallsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await engine()).myCapitalCalls(context.userId));

export const capitalCallDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(lineId.parse)
  .handler(async ({ data, context }): Promise<any> =>
    (await engine()).capitalCallForInvestor(context.userId, data.lineId),
  );

export const reportTransferInitiatedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(lineId.parse)
  .handler(async ({ data, context }) =>
    (await engine()).investorReportsTransferInitiated(context.userId, data.lineId),
  );

export const fundingReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(lineId.parse)
  .handler(async ({ data, context }): Promise<any> =>
    (await engine()).fundingReceipt(context.userId, data.lineId),
  );

// ------------------------------------------------------ funding operations

export const detectFundingMatchesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().min(1) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).detectFundingMatches(context.userId, data.offeringId),
  );

export const fundingQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().nullish() }).parse)
  .handler(async ({ data, context }): Promise<any> =>
    (await engine()).fundingQueue(context.userId, data.offeringId ?? null),
  );

export const decideFundingMatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      matchId: z.string().min(1),
      decision: z.enum(["approve", "reject", "correct", "request_information"]),
      expectedFundingId: z.string().nullish(),
      amountCents: z.number().int().nullish(),
      reason: z.string().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }): Promise<any> =>
    (await engine()).decideFundingMatch(context.userId, {
      matchId: data.matchId,
      decision: data.decision,
      expectedFundingId: data.expectedFundingId ?? null,
      amountCents: data.amountCents ?? null,
      reason: data.reason ?? null,
    }),
  );

export const postFundingMatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ matchId: z.string().min(1) }).parse)
  .handler(async ({ data, context }) => (await engine()).postFundingMatch(context.userId, data.matchId));

export const reverseFundingMatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ matchId: z.string().min(1), reason: z.string().min(4) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).reverseFundingMatch(context.userId, data.matchId, data.reason),
  );

export const resolveFundingExceptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ exceptionId: z.string().min(1), resolution: z.string().min(4) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).resolveFundingException(context.userId, data.exceptionId, data.resolution),
  );

export const closingDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().nullish() }).parse)
  .handler(async ({ data, context }): Promise<any> =>
    (await engine()).closingDashboard(context.userId, data.offeringId ?? null),
  );

export const managerFundingBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().nullish() }).parse)
  .handler(async ({ data, context }): Promise<any> =>
    (await engine()).managerFundingBoard(context.userId, data.offeringId ?? null),
  );

export const fundingAuditTrailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().min(1) }).parse)
  .handler(async ({ data, context }): Promise<any> =>
    (await engine()).fundingAuditTrail(context.userId, data.onboardingId),
  );
