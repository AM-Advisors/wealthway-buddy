import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

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
  notApplicable: z.array(z.enum(["managementFee", "carry", "preferredReturn", "orgExpense", "distributionFrequency", "minInvestment"])).max(6).optional(),
});
const fundClass = z.object({
  key: z.string().max(60).default(""),
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullish(),
  managementFee: fee.optional(),
  carry: carry.optional(),
  preferredReturnPercent: z.number().min(0).max(100).nullish(),
  minInvestmentCents: z.number().int().min(0).nullish(),
  notApplicable: z.array(z.enum(["managementFee", "carry", "preferredReturn", "orgExpense", "distributionFrequency", "minInvestment"])).max(6).optional(),
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

// ---------------------------------------------------------------- Offering Documents (Phase 2)
const docs = () => import("@/lib/offering-document-setup.server");
const applicability = z.object({ profileTypes: z.array(z.string().max(60)).max(20).optional(), classKeys: z.array(z.string().max(60)).max(20).optional() });
const signingConfig = z.object({
  signers: z
    .array(
      z.object({
        role: z.enum(["investor", "joint_investor", "entity_authorized_signer", "trustee", "fund_signatory", "other_authorized_signer"]),
        fields: z.array(z.enum(["signature", "printed_name", "title", "entity_name", "date_signed", "initials"])).max(6),
        order: z.number().int().min(1).max(10),
      }),
    )
    .max(6),
});

export const listSetupDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await docs()).listSetupDocuments(context.userId, data.offeringId));

export const createSetupDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, category: z.enum(["operating_agreement", "subscription_agreement", "ppm", "other"]), title: z.string().trim().max(160).nullish() }).parse)
  .handler(async ({ data, context }) => (await docs()).createSetupDocument(context.userId, data));

export const uploadDocumentVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: uuid, filePath: z.string().min(3).max(400), fileName: z.string().trim().min(1).max(200), fileSizeBytes: z.number().int().min(0).max(60 * 1024 * 1024), effectiveDate: z.string().max(20).nullish() }).parse)
  .handler(async ({ data, context }) => (await docs()).uploadDocumentVersion(context.userId, data));

export const approveDocumentVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: uuid, version: z.number().int().min(1) }).parse)
  .handler(async ({ data, context }) => (await docs()).approveDocumentVersion(context.userId, data));

export const setDocumentUsageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: uuid, usage: z.enum(["reference", "acknowledgment", "signature"]), applicability }).parse)
  .handler(async ({ data, context }) => (await docs()).setDocumentUsage(context.userId, data));

export const saveSigningConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: uuid, version: z.number().int().min(1), config: signingConfig, confirm: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await docs()).saveSigningConfig(context.userId, data));

export const previewVersionImpactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: uuid }).parse)
  .handler(async ({ data, context }) => (await docs()).previewVersionImpact(context.userId, data));

export const activateDocumentVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: uuid, version: z.number().int().min(1), scope: z.enum(["new_only", "all", "single"]).optional(), targetOnboardingId: uuid.nullish(), note: z.string().trim().max(1000).nullish(), impactAcknowledged: z.boolean().optional() }).parse)
  .handler(async ({ data, context }) => (await docs()).activateDocumentVersion(context.userId, data));

export const rolloutPreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: uuid }).parse)
  .handler(async ({ data, context }) => (await docs()).rolloutPreview(context.userId, data));

export const resolveResignItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, status: z.enum(["sent", "signed", "waived"]) }).parse)
  .handler(async ({ data, context }) => (await docs()).resolveResignItem(context.userId, data));

export const requestDocumentChangeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: uuid, filePath: z.string().min(3).max(400), fileName: z.string().min(1).max(260), fileSizeBytes: z.number().int().min(0), scope: z.enum(["new_only", "all", "single"]), targetOnboardingId: uuid.nullish(), note: z.string().trim().max(1000).nullish() }).parse)
  .handler(async ({ data, context }) => (await docs()).requestDocumentChange(context.userId, data));

export const decideChangeRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, decision: z.enum(["accept", "decline"]), note: z.string().trim().max(1000).nullish() }).parse)
  .handler(async ({ data, context }) => (await docs()).decideChangeRequest(context.userId, data));

export const investorDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid }).parse)
  .handler(async ({ data, context }) => (await docs()).investorDocuments(context.userId, data.onboardingId));

export const acknowledgeDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, documentId: uuid }).parse)
  .handler(async ({ data, context }) => (await docs()).acknowledgeDocument(context.userId, data));

// ---------------------------------------------------------------- Fund Setup Phase 3
const p3 = () => import("@/lib/fund-setup-phase3.server");
const bankDetails = z.object({
  bank_name: z.string().trim().max(160).default(""),
  bank_address: z.string().trim().max(240).default(""),
  account_name: z.string().trim().max(160).default(""),
  account_number: z.string().trim().regex(/^[0-9A-Za-z-]{0,34}$/, "Account number has unexpected characters").default(""),
  routing_number: z.string().trim().regex(/^(\d{9})?$/, "Routing number must be 9 digits").default(""),
  swift: z.string().trim().regex(/^([A-Za-z0-9]{8}|[A-Za-z0-9]{11})?$/, "SWIFT/BIC must be 8 or 11 characters").default(""),
  memo: z.string().trim().max(240).default(""),
});
const filing = z.enum(["not_applicable", "required", "harmonious", "client_counsel"]).nullable();
const einStatus = z.enum(["information_needed", "ready_for_review", "awaiting_signature", "ready_for_submission", "submitted", "ein_received", "needs_attention"]);

export const phase3OverviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await p3()).phase3Overview(context.supabase, context.userId, data.offeringId));

export const setBankingPathFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, path: z.enum(["harmonious", "client", "not_required"]), reason: z.string().trim().max(500).nullish() }).parse)
  .handler(async ({ data, context }) => (await p3()).setBankingPath(context.userId, data));

export const setHarmoniousBankStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, status: z.enum(["not_started", "information_needed", "in_progress", "account_opened", "wire_pending_verification", "funding_instructions_ready"]) }).parse)
  .handler(async ({ data, context }) => (await p3()).setHarmoniousBankStatus(context.supabase, context.userId, data));

export const saveBankDetailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, details: bankDetails }).parse)
  .handler(async ({ data, context }) => (await p3()).saveBankDetails(context.supabase, context.userId, data));

export const attachWireDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, version: z.number().int().min(1), filePath: z.string().min(3).max(400) }).parse)
  .handler(async ({ data, context }) => (await p3()).attachWireDocument(context.supabase, context.userId, data));

export const reviewBankVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, version: z.number().int().min(1), decision: z.enum(["verify", "reject", "accept_ownership"]), method: z.string().trim().max(200).nullish(), note: z.string().trim().max(1000).nullish() }).parse)
  .handler(async ({ data, context }) => (await p3()).reviewBankVersion(context.supabase, context.userId, data));

export const setEinPathFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, path: z.enum(["existing", "harmonious"]) }).parse)
  .handler(async ({ data, context }) => (await p3()).setEinPath(context.userId, data));

export const recordEinFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, ein: z.string().trim().max(12), letterPath: z.string().min(3).max(400).nullish(), received: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await p3()).recordEin(context.supabase, context.userId, data));

export const uploadSignedW9Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, path: z.string().min(3).max(400) }).parse)
  .handler(async ({ data, context }) => (await p3()).uploadSignedW9(context.userId, data));

export const saveSs4Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: uuid,
      answers: z.record(z.string().max(60), z.union([z.string().max(300), z.boolean()])),
      responsiblePersonId: uuid.nullish(),
      responsiblePartyTin: z.string().trim().max(12).nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { responsible_party_tin: _drop, ...answers } = data.answers as Record<string, unknown>;
    return (await p3()).saveSs4(context.supabase, context.userId, { ...data, answers });
  });

export const setEinStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, status: einStatus }).parse)
  .handler(async ({ data, context }) => (await p3()).setEinStatus(context.supabase, context.userId, data));

export const saveAdministrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: uuid,
      services: z.record(z.string().max(40), z.enum(["included", "not_included"])),
      formD: filing,
      blueSky: filing,
    }).parse,
  )
  .handler(async ({ data, context }) => (await p3()).saveAdministration(context.userId, data as any));

export const classAssignmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await p3()).classAssignments(context.userId, data.offeringId));

export const previewClassChangeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid }).parse)
  .handler(async ({ data, context }) => (await p3()).previewClassChange(context.userId, data));

export const changeInvestmentClassFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, classKey: z.string().max(60).nullable(), acknowledged: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await p3()).changeInvestmentClass(context.userId, data));

export const pendingWireVerificationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await p3()).pendingWireVerifications(context.supabase, context.userId));

const signatories = () => import("@/lib/fund-signatories.server");
const opt = z.string().max(200).nullish();

export const listFundSignatoriesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await signatories()).listFundSignatories(context.userId, data.offeringId));

export const addFundSignatoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: uuid,
      candidateKey: z.string().max(80).nullish(),
      newPerson: z.object({ fullName: z.string().trim().min(2).max(160), email: z.string().trim().email().max(254).nullish().or(z.literal("")), title: opt }).nullish(),
      title: opt,
      capacity: opt,
      makePrimary: z.boolean().optional(),
      confirmSeparate: z.boolean().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await signatories()).addFundSignatory(context.userId, data));

export const updateFundSignatoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, id: uuid, title: opt, capacity: opt, makePrimary: z.boolean().optional(), remove: z.boolean().optional() }).parse)
  .handler(async ({ data, context }) => (await signatories()).updateFundSignatory(context.userId, data));
