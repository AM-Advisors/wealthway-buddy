import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const engine = () => import("@/lib/fund-setup-canonical.server");
const uuid = z.string().uuid();

const fee = z
  .object({
    ratePercent: z.number().min(0).max(100).nullable(),
    basis: z.enum(["committed_capital", "invested_capital", "nav", "flat"]).nullable(),
    frequency: z.enum(["one_time", "annual", "quarterly", "monthly"]).nullable(),
    effectiveFrom: z.string().max(20).nullish(),
    effectiveTo: z.string().max(20).nullish(),
  })
  .nullable();
const carry = z.object({ ratePercent: z.number().min(0).max(100).nullable(), applicability: z.string().max(200).nullish() }).nullable();
const terms = z.object({
  managementFee: fee,
  carry,
  preferredReturnPercent: z.number().min(0).max(100).nullish(),
  orgExpenseTreatment: z.string().max(500).nullish(),
  distributionFrequency: z.string().max(100).nullish(),
});
const fundClass = z.object({
  key: z.string().max(60).default(""),
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullish(),
  managementFee: fee.optional(),
  carry: carry.optional(),
  preferredReturnPercent: z.number().min(0).max(100).nullish(),
  minInvestmentCents: z.number().int().min(0).nullish(),
});

export const getFundSetupOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => {
    // EIN presence is read through the caller's own guarded lookup; the number never leaves it here.
    const { data: detail } = await context.supabase
      .rpc("get_offering_entity_details", { p_offering_id: data.offeringId })
      .maybeSingle();
    const hasEin = Boolean((detail as any)?.ein);
    return (await engine()).fundSetupOverview(context.userId, data.offeringId, hasEin);
  });

const str = z.string().max(300).nullish();
export const saveFundSetupFieldsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: uuid,
      fields: z
        .object({
          displayName: z.string().min(1).max(200),
          fundType: str,
          gpName: str,
          signatoryPersonId: uuid.nullish(),
          signatoryTitle: str,
          signatoryCapacity: str,
          signatoryEntityName: str,
          entityType: str,
          jurisdiction: str,
          formationDate: z.string().max(20).nullish(),
          registeredAgent: str,
          principalAddress: z.string().max(500).nullish(),
          taxClassification: str,
          regType: z.enum(["506b", "506c", "regcf", "rega", "regaplus"]),
          targetRaiseCents: z.number().int().min(0).nullish(),
          maxOfferingCents: z.number().int().min(0).nullish(),
          minInvestmentCents: z.number().int().min(0),
          maxInvestmentCents: z.number().int().min(0).nullish(),
          offeringOpenDate: z.string().max(20).nullish(),
          offeringCloseDate: z.string().max(20).nullish(),
          rollingCloses: z.boolean().nullish(),
          hasMultipleClasses: z.boolean(),
        })
        .partial(),
      setupFields: z
        .object({
          fiscalYearEnd: z.string().max(10).nullish(),
          fundTermMonths: z.number().int().min(0).max(600).nullish(),
          investmentPeriodMonths: z.number().int().min(0).max(600).nullish(),
        })
        .partial()
        .optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).saveFundSetupFields(context.userId, data));

export const previewLegalNameChangeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, legalName: z.string().min(1).max(200) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).previewLegalNameChange(context.userId, data.offeringId, data.legalName),
  );

export const changeLegalNameFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: uuid,
      legalName: z.string().min(1).max(200),
      effectiveDate: z.string().max(20).nullish(),
      reason: z.string().max(500).nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).changeLegalName(context.userId, data));

export const saveFundEconomicsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ offeringId: uuid, terms, classes: z.array(fundClass).max(20), changeReason: z.string().max(500).nullish() }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).saveFundEconomics(context.userId, data as any));

export const assignInvestmentClassFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, classKey: z.string().max(60).nullable() }).parse)
  .handler(async ({ data, context }) => (await engine()).assignInvestmentClass(context.userId, data));
