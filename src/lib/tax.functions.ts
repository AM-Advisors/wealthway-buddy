/**
 * Authenticated server-function surface for tax operations.
 *
 * Every handler re-resolves authority server-side. Nothing trusts a role,
 * fund id, household id or form id supplied by the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const year = z.number().int().min(1990).max(2100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const viewer = z
  .object({
    onBehalfOfUserId: uuid.optional(),
    delegationId: uuid.optional(),
    organizationId: uuid.optional(),
  })
  .optional();

const entity = () => import("@/lib/tax.server");
const individual = () => import("@/lib/individual-tax.server");

// ------------------------------------------------------------ operations

export const getTaxOperationsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taxYear: year.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) =>
    (await entity()).taxOperationsOverview(context.userId, data.taxYear),
  );

export const getTaxYearDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taxYearId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).taxYearDetail(context.userId, data.taxYearId),
  );

export const openFundTaxYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: uuid,
        taxYear: year,
        periodStart: isoDate.optional(),
        periodEnd: isoDate.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => (await entity()).openTaxYear(context.userId, data));

export const refreshTaxYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taxYearId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).refreshTaxYearReadiness(context.userId, data.taxYearId),
  );

export const setTaxYearStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taxYearId: uuid, status: z.string() }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).transitionTaxYear(context.userId, data.taxYearId, data.status),
  );

// -------------------------------------------------------- tax identity

export const saveTaxDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        investmentProfileId: uuid.nullish(),
        personId: uuid.nullish(),
        subjectUserId: uuid.nullish(),
        offeringId: uuid.nullish(),
        formType: z.string(),
        classification: z.string().nullish(),
        tinType: z.enum(["ssn", "ein", "itin", "foreign", "none"]).nullish(),
        // Last four digits only. A full TIN is refused server-side.
        tinLast4: z.string().regex(/^[0-9A-Za-z]{4}$/).nullish(),
        certificationDate: isoDate.nullish(),
        receivedDate: isoDate.nullish(),
        storagePath: z.string().nullish(),
        isSubstitute: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).recordTaxDocument(context.userId, data as any),
  );

export const reviewTaxDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        documentId: uuid,
        decision: z.enum(["valid", "invalid", "in_review"]),
        notes: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).reviewTaxDocument(context.userId, data.documentId, data.decision, data.notes),
  );

// -------------------------------------------------------- adjustments

export const saveAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        taxYearId: uuid,
        itemCode: z.string(),
        category: z.string(),
        differenceType: z.enum(["timing", "permanent"]),
        bookAmountCents: z.number().int(),
        adjustmentCents: z.number().int(),
        explanation: z.string().min(1),
        accountId: uuid.nullish(),
        source: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).saveBookTaxAdjustment(context.userId, data as any),
  );

export const approveAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ adjustmentId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).approveBookTaxAdjustment(context.userId, data.adjustmentId),
  );

export const getBookToTaxBridge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taxYearId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).bookToTaxBridge(context.userId, data.taxYearId),
  );

// --------------------------------------------------------- allocations

export const runTaxAllocationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ taxYearId: uuid, methodologyCode: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => (await entity()).runTaxAllocation(context.userId, data));

export const finalizeTaxAllocationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).finalizeTaxAllocation(context.userId, data.runId),
  );

// ---------------------------------------------------------- 1065 / K-1

export const prepare1065Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taxYearId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await entity()).prepare1065(context.userId, data.taxYearId));

export const setEntityReturnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ returnId: uuid, status: z.string(), note: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).transitionEntityReturn(context.userId, data.returnId, data.status, data.note),
  );

export const generateK1Set = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ returnId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await entity()).generateK1s(context.userId, data.returnId));

export const setK1Status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ k1Id: uuid, status: z.string() }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).transitionK1(context.userId, data.k1Id, data.status),
  );

export const amendK1Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ k1Id: uuid, reason: z.string().min(1), boxes: z.record(z.string(), z.number()) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).amendK1(context.userId, data.k1Id, data.reason, data.boxes),
  );

// ----------------------------------------------------- withholding/1042

export const recordWithholdingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: uuid,
        taxYear: year,
        recipientUserId: uuid,
        investmentProfileId: uuid.nullish(),
        incomeCode: z.string(),
        grossAmountCents: z.number().int(),
        paymentDate: isoDate,
        classification: z.string(),
        treatyClaimed: z.boolean().optional(),
        treatyRateBps: z.number().int().nullish(),
        exemptionCode: z.string().nullish(),
        sourceType: z.string().optional(),
        sourceId: uuid.nullish(),
        dedupeKey: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).recordWithholding(context.userId, data as any),
  );

export const build1042 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offeringId: uuid, taxYear: year, taxYearId: uuid.nullish() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).build1042Package(context.userId, data as any),
  );

// ------------------------------------------------------------- 1099

export const recordPayeePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: uuid.nullish(),
        taxYear: year,
        payeeName: z.string(),
        payeeUserId: uuid.nullish(),
        payeeProfileId: uuid.nullish(),
        paymentType: z.string(),
        grossAmountCents: z.number().int(),
        paidOn: isoDate.nullish(),
        sourceType: z.string(),
        sourceId: uuid.nullish(),
        dedupeKey: z.string().min(1),
        filingResponsibility: z.string().optional(),
        payeeClassification: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).recordPayeePayment(context.userId, data as any),
  );

export const determinePayeeReportingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paymentId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).determinePayeeReporting(context.userId, data.paymentId),
  );

export const generate1099Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        taxYear: year,
        formType: z.string(),
        payerName: z.string(),
        recipientUserId: uuid.nullish(),
        recipientProfileId: uuid.nullish(),
        paymentIds: z.array(uuid).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => (await entity()).generate1099(context.userId, data as any));

export const set1099Status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ formId: uuid, status: z.string() }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).transition1099(context.userId, data.formId, data.status),
  );

export const correct1099Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ formId: uuid, reason: z.string().min(1), boxes: z.record(z.string(), z.number()) })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).correct1099(context.userId, data.formId, data.reason, data.boxes),
  );

export const reconcile1099 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taxYear: year }).parse(d))
  .handler(async ({ data, context }) =>
    (await entity()).reconcile1099Year(context.userId, data.taxYear),
  );

// ------------------------------------------------------- manager surface

export const getFundTaxOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offeringId: uuid, taxYear: year.optional() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).fundTaxOverview(context.userId, data.offeringId, data.taxYear),
  );

export const managerRespondToTaxReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        returnId: uuid,
        response: z.enum(["acknowledged", "challenged"]),
        note: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await entity()).managerRespondToReturn(context.userId, data.returnId, data.response, data.note),
  );

// ------------------------------------------------------ investor surface

export const getInvestorTaxDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => viewer.parse(d ?? {}) ?? {})
  .handler(async ({ data, context }) =>
    (await entity()).investorTaxDocuments(context.userId, data ?? {}),
  );

export const getInvestorTaxForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        table: z.enum(["k1_forms", "form_1042s_records", "form_1099_records"]),
        id: uuid,
        onBehalfOfUserId: uuid.optional(),
        delegationId: uuid.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { table, id, ...rest } = data;
    return (await entity()).investorTaxFormDetail(context.userId, { table, id }, rest);
  });

// ------------------------------------------------------ personal 1040

export const getPersonalTaxCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        householdId: uuid.optional(),
        taxYear: year.optional(),
        onBehalfOfUserId: uuid.optional(),
        delegationId: uuid.optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { householdId, taxYear, ...rest } = data;
    return (await individual()).personalTaxCenter(context.userId, {
      ...(householdId ? { householdId } : {}),
      ...(taxYear ? { taxYear } : {}),
      viewer: rest,
    });
  });

export const ensureTaxHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ primaryUserId: uuid.optional(), name: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => (await individual()).ensureHousehold(context.userId, data));

export const authorizeHouseholdMemberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        householdId: uuid,
        memberUserId: uuid,
        taxYear: year,
        relationship: z.enum(["spouse", "dependent", "other"]),
        filingStatus: z.string().nullish(),
        authorized: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await individual()).authorizeHouseholdMember(context.userId, data as any),
  );

export const openIndividualReturnFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ householdId: uuid, taxYear: year, filingStatus: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    (await individual()).openIndividualReturn(context.userId, data),
  );

export const requestTaxInformation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ householdId: uuid, taxYear: year, documentType: z.string(), note: z.string().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await individual()).requestTaxDocument(context.userId, data),
  );

export const saveIndividualDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        householdId: uuid,
        taxYear: year,
        documentType: z.string(),
        structuredData: z.record(z.string(), z.unknown()).optional(),
        storagePath: z.string().nullish(),
        issuer: z.string().nullish(),
        documentId: uuid.nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await individual()).recordIndividualDocument(context.userId, data as any),
  );

export const importHarmoniousTaxForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ householdId: uuid, taxYear: year }).parse(d))
  .handler(async ({ data, context }) =>
    (await individual()).importHarmoniousDocuments(context.userId, data),
  );

export const recalculateIndividualReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ returnId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    (await individual()).recalculateReturn(context.userId, data.returnId),
  );

export const setIndividualReturnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ returnId: uuid, status: z.string(), note: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    (await individual()).transitionIndividualReturn(
      context.userId,
      data.returnId,
      data.status,
      data.note,
    ),
  );

export const taxpayerApprove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ returnId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    (await individual()).taxpayerApproveReturn(context.userId, data.returnId),
  );

export const amendIndividualReturnFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ returnId: uuid, reason: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) =>
    (await individual()).amendIndividualReturn(context.userId, data.returnId, data.reason),
  );

export const saveStateTaxReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        federalReturnId: uuid.nullish(),
        partnershipReturnId: uuid.nullish(),
        householdId: uuid.nullish(),
        offeringId: uuid.nullish(),
        taxYear: year,
        jurisdiction: z.string(),
        residency: z.enum(["resident", "part_year", "nonresident"]).optional(),
        stateWithholdingCents: z.number().int().optional(),
        status: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    (await individual()).saveStateReturn(context.userId, data as any),
  );
