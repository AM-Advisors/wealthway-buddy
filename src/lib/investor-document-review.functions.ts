import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const svc = () => import("@/lib/investor-document-review.server");

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
