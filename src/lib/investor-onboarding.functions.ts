/**
 * Authenticated server-function surface for investor onboarding (Phase B).
 *
 * Every handler re-resolves authority inside the engine from the signed-in
 * user. Nothing trusts a role, fund id, profile id, amount or funding state
 * supplied by the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const engine = () => import("@/lib/investor-onboarding.server");

const onboardingInput = z.object({ onboardingId: z.string().min(1) });

/** Public fund landing: launched offerings only, investor-facing fields only. */
export const getOfferingLanding = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1) }).parse)
  .handler(async ({ data }) => (await engine()).offeringLanding(data.slug));

export const startOnboardingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ slugOrId: z.string().min(1), invitationToken: z.string().nullish() }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).startOnboarding(context.userId, {
      slugOrId: data.slugOrId,
      invitationToken: data.invitationToken ?? null,
    }),
  );

export const myInvestmentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await engine()).myInvestments(context.userId));

export const eligibleProfilesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await engine()).eligibleProfiles(context.userId));

export const onboardingDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(onboardingInput.parse)
  .handler(async ({ data, context }) => (await engine()).onboardingDetail(context.userId, data.onboardingId));

export const chooseProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().min(1),
      profileId: z.string().nullish(),
      create: z
        .object({
          profileType: z.string().min(1),
          displayLabel: z.string().min(1),
          legalName: z.string().nullish(),
        })
        .optional(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).chooseProfile(context.userId, {
      onboardingId: data.onboardingId,
      profileId: data.profileId ?? null,
      ...(data.create ? { create: { ...data.create, legalName: data.create.legalName ?? null } } : {}),
    }),
  );

export const setInvestmentAmountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().min(1), amountCents: z.number().int() }).parse)
  .handler(async ({ data, context }) => (await engine()).setInvestmentAmount(context.userId, data));

export const saveQuestionnaireFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().min(1),
      answers: z.record(z.string(), z.any()),
      submit: z.boolean().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).saveQuestionnaire(context.userId, {
      onboardingId: data.onboardingId,
      answers: data.answers,
      ...(data.submit === undefined ? {} : { submit: data.submit }),
    }),
  );

export const prepareSubscriptionDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(onboardingInput.parse)
  .handler(async ({ data, context }) =>
    (await engine()).prepareSubscriptionDocuments(context.userId, data.onboardingId),
  );

export const recordSubscriptionSignatureFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().min(1),
      signerName: z.string().min(2).max(120),
      capacity: z.string().max(120).nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).recordSubscriptionSignature(context.userId, {
      onboardingId: data.onboardingId,
      signerName: data.signerName,
      capacity: data.capacity ?? null,
    }),
  );

export const fundingInstructionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(onboardingInput.parse)
  .handler(async ({ data, context }) => (await engine()).fundingInstructions(context.userId, data.onboardingId));

export const investorReportsFundsSentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(onboardingInput.parse)
  .handler(async ({ data, context }) =>
    (await engine()).investorReportsFundsSent(context.userId, data.onboardingId),
  );

// ------------------------------------------------------ operations

export const reviewQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({
        offeringId: z.string().nullish(),
        bucket: z.string().nullish(),
        investorUserId: z.string().nullish(),
        assignedTo: z.string().nullish(),
      })
      .parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).reviewQueue(context.userId, {
      offeringId: data.offeringId ?? null,
      bucket: data.bucket ?? null,
      investorUserId: data.investorUserId ?? null,
      assignedTo: data.assignedTo ?? null,
    }),
  );

export const reviewDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(onboardingInput.parse)
  .handler(async ({ data, context }) => (await engine()).reviewDetail(context.userId, data.onboardingId));

export const approveToFundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ onboardingId: z.string().min(1), acceptedAmountCents: z.number().int().optional() }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).approveToFund(context.userId, {
      onboardingId: data.onboardingId,
      ...(data.acceptedAmountCents === undefined ? {} : { acceptedAmountCents: data.acceptedAmountCents }),
    }),
  );

export const setOnboardingStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().min(1), stage: z.string().min(1) }).parse)
  .handler(async ({ data, context }) => (await engine()).setOnboardingStage(context.userId, data));

export const assignOnboardingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().min(1), assignee: z.string().nullable() }).parse)
  .handler(async ({ data, context }) => (await engine()).assignOnboarding(context.userId, data));

export const raiseExceptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().min(1),
      type: z.string().min(1),
      severity: z.string().optional(),
      owner: z.string().optional(),
      detail: z.string().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).raiseException(context.userId, {
      onboardingId: data.onboardingId,
      type: data.type,
      ...(data.severity === undefined ? {} : { severity: data.severity }),
      ...(data.owner === undefined ? {} : { owner: data.owner }),
      detail: data.detail ?? null,
    }),
  );

export const resolveExceptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ exceptionId: z.string().min(1), resolution: z.string().min(2) }).parse)
  .handler(async ({ data, context }) => (await engine()).resolveException(context.userId, data));

export const applyBankActivityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ bankTransactionId: z.string().min(1), onboardingId: z.string().nullish() }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).applyBankActivity(context.userId, {
      bankTransactionId: data.bankTransactionId,
      onboardingId: data.onboardingId ?? null,
    }),
  );

export const acceptSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().min(1),
      signerName: z.string().min(2),
      capacity: z.string().min(2),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).acceptSubscription(context.userId, data));

export const closeInvestmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().min(1), closingDate: z.string().optional() }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).closeInvestment(context.userId, {
      onboardingId: data.onboardingId,
      ...(data.closingDate === undefined ? {} : { closingDate: data.closingDate }),
    }),
  );

export const managerOnboardingBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().nullish() }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).managerOnboardingBoard(context.userId, data.offeringId ?? null),
  );

export const inviteInvestorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: z.string().min(1),
      email: z.string().email(),
      name: z.string().nullish(),
      intendedAmountCents: z.number().int().nullish(),
      source: z.string().nullish(),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).inviteInvestor(context.userId, {
      offeringId: data.offeringId,
      email: data.email,
      name: data.name ?? null,
      intendedAmountCents: data.intendedAmountCents ?? null,
      source: data.source ?? null,
      ...(data.expiresInDays === undefined ? {} : { expiresInDays: data.expiresInDays }),
    }),
  );

export const startInvestmentVerificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(onboardingInput.parse)
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    let origin = "https://app.harmonious.co";
    try {
      const url = getRequest()?.url;
      if (url) origin = new URL(url).origin;
    } catch {
      /* production origin */
    }
    return (await engine()).startInvestmentVerification(context.userId, data.onboardingId, origin);
  });

// ------------------------------------------- onboard.harmonious.co portal

export const claimOnboardInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ reference: z.string().regex(/^[A-Za-z0-9]{16,64}$/) }).parse)
  .handler(async ({ data, context }) => (await engine()).claimOnboardInvitation(context.userId, data.reference));

export const onboardPortalDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(onboardingInput.parse)
  .handler(async ({ data, context }) => (await engine()).onboardPortalDetail(context.userId, data.onboardingId));

export const resendOnboardInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ invitationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await engine()).resendOnboardInvitation(context.userId, data.invitationId));

/** Didit session that returns the investor to this exact investment in the portal. */
export const startPortalVerificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(onboardingInput.parse)
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    let origin = "https://onboard.harmonious.co";
    try {
      const url = getRequest()?.url;
      if (url) origin = new URL(url).origin;
    } catch {
      /* production origin */
    }
    const { safeOnboardReturnPath } = await import("@/lib/onboard-portal-model");
    const returnPath = safeOnboardReturnPath(`/onboard/i/${data.onboardingId}`);
    return (await engine()).startInvestmentVerification(context.userId, data.onboardingId, origin, returnPath);
  });
