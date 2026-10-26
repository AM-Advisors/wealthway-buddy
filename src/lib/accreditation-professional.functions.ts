import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const role = z.enum(["cpa", "attorney", "investment_adviser", "broker_dealer"]);

export const listProfessionalRequestsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/accreditation-professional.server")).listRequests(context.userId, data.onboardingId));

export const createProfessionalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    onboardingId: z.string().uuid(), name: z.string().trim().min(2).max(160), firm: z.string().trim().max(160).default(""),
    role, email: z.string().trim().email().max(254),
  }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/accreditation-professional.server")).createRequest(context.userId, data));

export const resendProfessionalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ requestId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/accreditation-professional.server")).resendRequest(context.userId, data.requestId));

export const cancelProfessionalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ requestId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/accreditation-professional.server")).cancelRequest(context.userId, data.requestId));

/** Public: the professional's upload page header. Reveals only names. */
export const resolveProfessionalLinkFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(20).max(200) }).parse)
  .handler(async ({ data }) => (await import("@/lib/accreditation-professional.server")).resolveUploadLink(data.token));
