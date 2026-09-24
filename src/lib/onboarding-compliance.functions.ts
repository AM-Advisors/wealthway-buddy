import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const originOf = () => {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return null;
  }
};

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
      foreignTin: z.string().trim().max(40).nullable().optional(),
      certifiedName: z.string().trim().min(2).max(200),
      acknowledgedRevision: z.string().trim().max(60),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).certifyTaxForm(context.userId, { ...data, origin: originOf() }));

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

const taxAnswers = z.object({
  usPerson: z.enum(["yes", "no", "unsure"]).optional(),
  citizenshipCountry: z.string().trim().max(60).optional(),
  taxResidenceCountry: z.string().trim().max(60).optional(),
  capacity: z.enum(["beneficial_owner", "intermediary", "flow_through", "branch", "unsure"]).optional(),
  exemptStatus: z.enum(["none", "foreign_government", "international_organization", "foreign_central_bank", "foreign_tax_exempt_organization", "foreign_private_foundation", "government_of_us_possession", "unsure"]).optional(),
  effectivelyConnected: z.enum(["yes", "no", "unsure"]).optional(),
});

export const submitTaxFactsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid(), answers: taxAnswers }).parse)
  .handler(async ({ data, context }) => (await engine()).submitTaxFacts(context.userId, data));

export const previewTaxFormFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().uuid(),
      formType: z.enum(["w9", "w8ben", "w8bene", "w8eci", "w8exp", "w8imy"]),
      legalName: z.string().trim().min(2).max(200),
      tin: z.string().trim().max(20).nullable().optional(),
      foreignTin: z.string().trim().max(40).nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).previewTaxForm(context.userId, { ...data, origin: originOf() }));

export const myTaxDocumentUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await engine()).investorTaxDocumentUrl(context.userId, data.onboardingId));

export const submitAmlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().uuid(),
      answers: z.record(z.string().max(40), z.string().max(600)),
      certifiedName: z.string().trim().min(2).max(200),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).submitAml(context.userId, data));

export const submitDemographicsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid(), answers: z.record(z.string().max(40), z.string().max(60)) }).parse)
  .handler(async ({ data, context }) => (await engine()).submitDemographics(context.userId, data));

export const submitEligibilityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      onboardingId: z.string().uuid(),
      key: z.string().max(60),
      answer: z.enum(["yes", "no", "unsure"]),
      certifiedName: z.string().trim().min(2).max(200),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).submitEligibility(context.userId, data));

export const staffTaxEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ taxFormId: z.string().uuid(), kind: z.enum(["document", "tin"]), purpose: z.string().trim().min(5).max(300) }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).staffTaxEvidence(context.userId, data));

export const getEligibilitySetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await engine()).getEligibilitySetup(context.userId, data.offeringId));

export const saveEligibilityDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid(), requirements: z.array(z.record(z.string(), z.unknown())).max(30) }).parse)
  .handler(async ({ data, context }) => (await engine()).saveEligibilityDraft(context.userId, data));

export const approveEligibilityDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid(), draftId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await engine()).approveEligibilityDraft(context.userId, data));
