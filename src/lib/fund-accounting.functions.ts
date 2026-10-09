import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/fund-accounting.server");
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int();

export const accountingOverviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).accountingOverview(context.userId, data.offeringId) as Promise<any>);

export const listMappingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).listMappings(context.userId, data.offeringId) as Promise<any>);

export const setMappingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, purpose: z.string().max(60), accountId: uuid, note: z.string().max(500).nullable() }).parse)
  .handler(async ({ data, context }) => (await srv()).setMapping(context.userId, data));

export const prepareInvestmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offeringId: uuid, kind: z.enum(["purchase", "additional_purchase"]), assetId: uuid.nullable(), newIssuerName: z.string().max(200).nullable(),
    newAssetName: z.string().max(200).nullable(), newAssetClass: z.string().max(60).nullable(), instrument: z.string().max(200).nullable(),
    tradeDate: date, settlementDate: date.nullable(), quantity: z.number().nullable(), unitPriceCents: cents.nullable(), principalCents: cents,
    transactionCostCents: cents, sourceReference: z.string().min(1).max(500), evidenceReference: z.string().max(500).nullable(),
    idempotencyKey: z.string().min(1).max(200), bankLineId: uuid.nullable(), bankTransactionId: uuid.nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).prepareInvestment(context.userId, data));

const decision = z.object({ id: uuid, approve: z.boolean(), reason: z.string().max(2000).nullable() });
const idOnly = z.object({ id: uuid });

export const decideInvestmentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(decision.parse)
  .handler(async ({ data, context }) => (await srv()).decideInvestment(context.userId, data.id, data.approve, data.reason));
export const postInvestmentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idOnly.parse)
  .handler(async ({ data, context }) => (await srv()).postInvestment(context.userId, data.id));
export const reverseInvestmentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, reason: z.string().min(3).max(2000) }).parse)
  .handler(async ({ data, context }) => (await srv()).reverseInvestment(context.userId, data.id, data.reason));

export const prepareExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offeringId: uuid, category: z.string().max(60), vendor: z.string().min(1).max(200), description: z.string().min(1).max(500),
    invoiceNumber: z.string().max(100).nullable(), invoiceDate: date.nullable(), serviceStart: date.nullable(), serviceEnd: date.nullable(),
    expenseDate: date, amountCents: cents, paymentMode: z.enum(["paid", "accrued"]), paidOn: date.nullable(),
    sourceReference: z.string().min(1).max(500), evidenceReference: z.string().max(500).nullable(), bankLineId: uuid.nullable(), bankTransactionId: uuid.nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).prepareExpense(context.userId, data));
export const decideExpenseFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(decision.parse)
  .handler(async ({ data, context }) => (await srv()).decideExpense(context.userId, data.id, data.approve, data.reason));
export const postExpenseFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idOnly.parse)
  .handler(async ({ data, context }) => (await srv()).postExpense(context.userId, data.id));

export const prepareSettlementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offeringId: uuid, expenseId: uuid.nullable(), liabilityPurpose: z.enum(["accounts_payable", "accrued_expenses"]),
    openingLiabilityReference: z.string().max(500).nullable(), amountCents: cents, paidOn: date, sourceReference: z.string().min(1).max(500),
    idempotencyKey: z.string().min(1).max(200), bankLineId: uuid.nullable(), bankTransactionId: uuid.nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).prepareSettlement(context.userId, data));
export const decideSettlementFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(decision.parse)
  .handler(async ({ data, context }) => (await srv()).decideSettlement(context.userId, data.id, data.approve, data.reason));
export const postSettlementFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idOnly.parse)
  .handler(async ({ data, context }) => (await srv()).postSettlement(context.userId, data.id));

export const prepareFeeTermFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offeringId: uuid, classId: uuid.nullable(), positionId: uuid.nullable(), sideLetterId: uuid.nullable(),
    basis: z.enum(["committed_capital", "invested_capital", "net_asset_value"]), rateBps: z.number().int(),
    frequency: z.enum(["quarterly", "annual", "monthly"]), startsOn: date, endsOn: date.nullable(), sourceDocument: z.string().min(1).max(500),
    note: z.string().max(1000).nullable(), supersedesTermId: uuid.nullable(),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).prepareFeeTerm(context.userId, data));
export const decideFeeTermFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, approve: z.boolean(), reason: z.string().min(1).max(2000) }).parse)
  .handler(async ({ data, context }) => (await srv()).decideFeeTerm(context.userId, data.id, data.approve, data.reason));
export const feePreviewFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, start: date, end: date }).parse)
  .handler(async ({ data, context }) => (await srv()).feePreview(context.userId, data.offeringId, { start: data.start, end: data.end }) as Promise<any>);
