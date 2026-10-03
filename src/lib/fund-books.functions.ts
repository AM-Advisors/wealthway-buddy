import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/fund-books.server");
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fund = z.object({ fundId: uuid });

export const uploadStatementFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ fileName: z.string().min(1).max(200), contentType: z.string().max(120), base64: z.string().max(28_000_000) }).parse)
  .handler(async ({ data, context }) => (await srv()).uploadStatement(context.userId, data.fundId, data));

export const listStatementsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => (await srv()).listStatements(context.userId, data.fundId) as Promise<any[]>);

export const updateStatementLineFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ lineId: uuid, category: z.string().max(60).nullable(), onboardingId: uuid.nullable(), skip: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await srv()).updateLine(context.userId, data.fundId, data));

export const applyStatementFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ uploadId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).applyStatement(context.userId, data.fundId, data.uploadId));

export const addFundAssetFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({
    issuerName: z.string().trim().min(1).max(200), assetName: z.string().trim().min(1).max(200),
    assetClass: z.enum(["private_common", "private_preferred", "safe", "convertible_note", "debt", "fund_interest", "spv_interest", "real_estate", "digital_security", "cash_equivalent", "other"]),
    instrument: z.string().max(100).nullable(), acquisitionDate: date.nullable(), costCents: z.number().int().min(0).max(1e13), statementLineId: uuid.nullish(),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).addAsset(context.userId, data.fundId, data));

export const recordAssetMarkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ assetId: uuid, valueCents: z.number().int().min(0).max(1e13), date, method: z.enum(["recent_financing", "transaction_price", "secondary_transaction", "market_comparable", "public_market", "cost", "appraisal", "manager_mark", "third_party", "other"]), note: z.string().max(2000).nullable() }).parse)
  .handler(async ({ data, context }) => (await srv()).recordMark(context.userId, data.fundId, data));

export const decideAssetMarkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ valuationId: uuid, approve: z.boolean(), note: z.string().max(2000).nullable() }).parse)
  .handler(async ({ data, context }) => (await srv()).decideMark(context.userId, data.fundId, data.valuationId, data.approve, data.note));

export const booksFiguresFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ start: date, end: date, taxYear: z.number().int().min(2000).max(2100) }).parse)
  .handler(async ({ data, context }) => (await srv()).booksFigures(context.userId, data.fundId, data) as Promise<any>);

export const k1ReadinessFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => (await srv()).k1Readiness(context.userId, data.fundId));

/** Staff only: save the books-built statements as a draft package for the existing statement review. */
export const saveStatementDraftFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ periodType: z.enum(["quarterly", "annual"]), start: date, end: date }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv();
    const f = await s.booksFigures(context.userId, data.fundId, { start: data.start, end: data.end, taxYear: Number(data.end.slice(0, 4)) });
    const st = f.statements; const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const notes = [
      "Built from the fund's books (platform draft).",
      `Balance sheet: cash ${usd(st.balanceSheet.cashCents)}, investments ${usd(st.balanceSheet.investmentsCents)}, total assets ${usd(st.balanceSheet.totalAssetsCents)}, liabilities ${usd(st.balanceSheet.liabilitiesCents)}, partners' capital ${usd(st.balanceSheet.partnersCapitalCents)}.`,
      `Income statement: income ${usd(st.incomeStatement.incomeCents)}, expenses ${usd(st.incomeStatement.expensesCents)}, net income ${usd(st.incomeStatement.netIncomeCents)}, unrealized ${usd(st.incomeStatement.unrealizedGainCents)}.`,
      `Changes in capital: opening ${usd(st.changesInCapital.openingCents)}, contributions ${usd(st.changesInCapital.contributionsCents)}, distributions ${usd(st.changesInCapital.distributionsCents)}, closing ${usd(st.changesInCapital.closingCents)}.`,
    ].join("\n");
    const pk = await import("@/lib/financial-statement-packages.server");
    await pk.savePackage(context.userId, { offeringId: data.fundId, periodType: data.periodType, periodStart: data.start, periodEnd: data.end, notes });
    return { ok: true };
  });

export const listLiabilitiesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ data, context }) => (await srv()).listLiabilities(context.userId, data.fundId) as Promise<any[]>);

export const addLiabilityFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ description: z.string().trim().min(1).max(200), kind: z.enum(["accrued_expense", "payable", "loan", "management_fee_payable", "other"]), amountCents: z.number().int().min(1).max(1e13), incurredOn: date, note: z.string().max(2000).nullable() }).parse)
  .handler(async ({ data, context }) => (await srv()).addLiability(context.userId, data.fundId, data));

export const settleLiabilityFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(fund.extend({ id: uuid, settledOn: date }).parse)
  .handler(async ({ data, context }) => (await srv()).settleLiability(context.userId, data.fundId, data.id, data.settledOn));
