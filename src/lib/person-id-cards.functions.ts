import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const ob = z.string().uuid();

export const investmentIdentityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: ob }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/person-id-cards.server")).listInvestmentIdentity(context.userId, data.onboardingId));

export const startPersonIdUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    onboardingId: ob, personId: z.string().uuid(), side: z.enum(["front", "back", "passport_page"]),
    documentType: z.enum(["passport", "drivers_license", "state_id", "unknown"]), fileName: z.string().trim().min(1).max(200),
    mimeType: z.string().max(60), size: z.number().int(),
  }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/person-id-cards.server")).startPersonIdUpload(context.userId, data));

export const confirmPersonIdUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: ob, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/person-id-cards.server")).confirmPersonIdUpload(context.userId, data));

export const personIdCardUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: ob, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/person-id-cards.server")).personIdCardUrl(context.userId, data));

export const revealFullTaxNumberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: ob, personId: z.string().uuid().nullish(), entity: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/person-id-cards.server")).revealFullTaxNumber(context.userId, data));
