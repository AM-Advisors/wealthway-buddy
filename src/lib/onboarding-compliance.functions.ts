import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const engine = () => import("@/lib/onboarding-compliance.server");

export const investorComplianceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await engine()).investorComplianceView(context.userId, data.onboardingId));

export const certifyTaxFormFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().uuid(),
      formType: z.enum(["w9", "w8ben", "w8bene", "w8eci", "w8exp", "w8imy"]),
      legalName: z.string().trim().min(2).max(200),
      tin: z.string().trim().max(20).nullable().optional(),
      certifiedName: z.string().trim().min(2).max(200),
      acknowledgedRevision: z.string().trim().max(60),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).certifyTaxForm(context.userId, data));

export const submitBadActorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().uuid(),
      answers: z.record(z.string().max(40), z.enum(["yes", "no"])),
      certifiedName: z.string().trim().min(2).max(200),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).submitBadActor(context.userId, data));

export const certifyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().uuid(),
      key: z.enum(["accuracy", "authority_capacity", "offering_representations", "electronic_records", "privacy_terms"]),
      certifiedName: z.string().trim().min(2).max(200),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).certify(context.userId, data));
