import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PORTFOLIO_ASSET_CLASSES,
  VALUATION_METHODS,
  VALUATION_SOURCE_TYPES,
} from "@/lib/valuation-model";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const assetClass = z.enum(PORTFOLIO_ASSET_CLASSES);
const method = z.enum(VALUATION_METHODS);
const sourceType = z.enum(VALUATION_SOURCE_TYPES);

export const getPortfolioAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { listPortfolioAssets } = await import("@/lib/valuation.server");
    return listPortfolioAssets(context.userId, data.fundId);
  });

export const savePortfolioAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid.optional(),
        fundId: uuid,
        issuerName: z.string().min(1).max(200),
        assetName: z.string().min(1).max(200),
        assetClass,
        instrument: z.string().max(200).optional(),
        ctCompanyId: uuid.optional(),
        ctSecurityId: uuid.optional(),
        quantity: z.number().optional(),
        ownershipPct: z.number().optional(),
        acquisitionDate: isoDate.optional(),
        costBasisCents: z.number().int().nonnegative().optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { upsertPortfolioAsset } = await import("@/lib/valuation.server");
    return upsertPortfolioAsset(context.userId, {
      ...(data.id ? { id: data.id } : {}),
      offeringId: data.fundId,
      issuerName: data.issuerName,
      assetName: data.assetName,
      assetClass: data.assetClass,
      ...(data.instrument ? { instrument: data.instrument } : {}),
      ...(data.ctCompanyId ? { ctCompanyId: data.ctCompanyId } : {}),
      ...(data.ctSecurityId ? { ctSecurityId: data.ctSecurityId } : {}),
      ...(data.quantity === undefined ? {} : { quantity: data.quantity }),
      ...(data.ownershipPct === undefined ? {} : { ownershipPct: data.ownershipPct }),
      ...(data.acquisitionDate ? { acquisitionDate: data.acquisitionDate } : {}),
      ...(data.costBasisCents === undefined ? {} : { costBasisCents: data.costBasisCents }),
      ...(data.note ? { note: data.note } : {}),
    });
  });

export const getValuationQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fundId: uuid.optional(), status: z.string().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { valuationQueue } = await import("@/lib/valuation.server");
    return valuationQueue(context.userId, {
      ...(data.fundId ? { offeringId: data.fundId } : {}),
      ...(data.status ? { status: data.status as never } : {}),
    });
  });

export const getValuationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { valuationHistory } = await import("@/lib/valuation.server");
    return valuationHistory(context.userId, data.id);
  });

export const proposeAssetValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        assetId: uuid,
        valuationDate: isoDate,
        effectiveDate: isoDate,
        valueCents: z.number().int(),
        pricePerUnitCents: z.number().int().optional(),
        quantity: z.number().optional(),
        methodology: method,
        methodologyNote: z.string().max(2000).optional(),
        sourceType,
        source: z.string().max(500).optional(),
        sourceDate: isoDate.optional(),
        inputs: z.record(z.string(), z.unknown()).optional(),
        assumptions: z.string().max(4000).optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { proposeValuation } = await import("@/lib/valuation.server");
    return proposeValuation(context.userId, {
      assetId: data.assetId,
      valuationDate: data.valuationDate,
      effectiveDate: data.effectiveDate,
      valueCents: data.valueCents,
      methodology: data.methodology,
      sourceType: data.sourceType,
      ...(data.pricePerUnitCents === undefined ? {} : { pricePerUnitCents: data.pricePerUnitCents }),
      ...(data.quantity === undefined ? {} : { quantity: data.quantity }),
      ...(data.methodologyNote ? { methodologyNote: data.methodologyNote } : {}),
      ...(data.source ? { source: data.source } : {}),
      ...(data.sourceDate ? { sourceDate: data.sourceDate } : {}),
      ...(data.inputs ? { inputs: data.inputs } : {}),
      ...(data.assumptions ? { assumptions: data.assumptions } : {}),
      ...(data.note ? { note: data.note } : {}),
    });
  });

export const submitAssetValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { submitValuation } = await import("@/lib/valuation.server");
    return submitValuation(context.userId, data.id);
  });

export const decideAssetValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        action: z.enum(["approve", "return", "reject", "make_effective"]),
        reason: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { decideValuation } = await import("@/lib/valuation.server");
    return decideValuation(context.userId, {
      valuationId: data.id,
      action: data.action,
      ...(data.reason ? { reason: data.reason } : {}),
    });
  });

export const respondToAssetValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        response: z.enum(["acknowledge", "challenge"]),
        note: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { respondToValuation } = await import("@/lib/valuation.server");
    return respondToValuation(context.userId, {
      valuationId: data.id,
      response: data.response,
      ...(data.note ? { note: data.note } : {}),
    });
  });

export const addAssetValuationEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        valuationId: uuid,
        kind: z.string().max(60),
        title: z.string().min(1).max(200),
        storagePath: z.string().max(500).optional(),
        contentHash: z.string().max(200).optional(),
        structured: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { addValuationEvidence } = await import("@/lib/valuation.server");
    return addValuationEvidence(context.userId, {
      valuationId: data.valuationId,
      kind: data.kind,
      title: data.title,
      ...(data.storagePath ? { storagePath: data.storagePath } : {}),
      ...(data.contentHash ? { contentHash: data.contentHash } : {}),
      ...(data.structured ? { structured: data.structured } : {}),
    });
  });

export const getEvidenceLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { evidenceLink } = await import("@/lib/valuation.server");
    return evidenceLink(context.userId, data.id);
  });

export const prepareValuationGl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { prepareValuationJournal } = await import("@/lib/valuation.server");
    return prepareValuationJournal(context.userId, data.id);
  });

export const recordAssetRealization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        assetId: uuid,
        dispositionDate: isoDate,
        quantitySold: z.number().positive().optional(),
        proceedsCents: z.number().int().nonnegative(),
        counterparty: z.string().max(200).optional(),
        bankTransactionId: uuid.optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { recordRealization } = await import("@/lib/valuation.server");
    return recordRealization(context.userId, {
      assetId: data.assetId,
      dispositionDate: data.dispositionDate,
      proceedsCents: data.proceedsCents,
      ...(data.quantitySold === undefined ? {} : { quantitySold: data.quantitySold }),
      ...(data.counterparty ? { counterparty: data.counterparty } : {}),
      ...(data.bankTransactionId ? { bankTransactionId: data.bankTransactionId } : {}),
      ...(data.note ? { note: data.note } : {}),
    });
  });

export const prepareRealizationGl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { prepareRealizationJournal } = await import("@/lib/valuation.server");
    return prepareRealizationJournal(context.userId, data.id);
  });

export const getPortfolioAsOf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid, date: isoDate }).parse(data))
  .handler(async ({ data, context }) => {
    const { portfolioAsOfDate } = await import("@/lib/valuation.server");
    return portfolioAsOfDate(context.userId, data.fundId, data.date);
  });

export const getStalePositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { stalePositions } = await import("@/lib/valuation.server");
    return stalePositions(context.userId);
  });

export const saveFundValuationPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        assetClass: assetClass.optional(),
        stalenessDays: z.number().int().min(1).max(3650).optional(),
        increaseThresholdPct: z.number().min(0).max(1000).optional(),
        decreaseThresholdPct: z.number().min(0).max(1000).optional(),
        materialChangeCents: z.number().int().nonnegative().optional(),
        evidenceRequired: z.boolean().optional(),
        managerMayApprove: z.boolean().optional(),
        managerReviewRequired: z.boolean().optional(),
        unrealizedPolicyEnabled: z.boolean().optional(),
        sourcePriority: z.array(sourceType).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveValuationPolicy } = await import("@/lib/valuation.server");
    const { fundId, ...rest } = data;
    const payload = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    return saveValuationPolicy(context.userId, { offeringId: fundId, ...payload });
  });
