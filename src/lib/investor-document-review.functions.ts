import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const svc = () => import("@/lib/investor-document-review.server");

export const emailFundSignatoryFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid(), signatureId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { setupActor } = await import('@/lib/fund-setup.server');
    const actor = await setupActor(context.userId);
    if (!actor.isStaff && !actor.offeringIds.includes(data.offeringId)) throw new Error('You do not manage this fund.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { emailFundSignatory } = await import('@/lib/fund-signing-email.server');
    return emailFundSignatory(supabaseAdmin, context.userId, data);
  });

export const listDocumentReviewsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await svc()).listDocumentReviews(context.userId, data.offeringId));

export const decideDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offeringId: z.string().uuid(), onboardingId: z.string().uuid(), documentId: z.string().uuid(),
    decision: z.enum(["approved", "returned"]), note: z.string().max(2000).nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await svc()).decideDocument(context.userId, data));

export const signedCopyUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid(), signatureId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await svc()).signedCopyUrl(context.userId, data));

export const myInvitedFundsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await svc()).myInvitedFunds(context.userId));

export const startInvitedFundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ invitationId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await svc()).startInvitedFund(context.userId, data.invitationId));
