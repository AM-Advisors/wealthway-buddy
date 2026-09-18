import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  FINANCIAL_REPORT_FLOW,
  REPORTING_BASES,
  STATEMENTS,
  WORKPAPER_STATUSES,
} from "@/lib/financial-reporting-model";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const basis = z.enum(REPORTING_BASES);
const periodInput = z.object({
  fundId: uuid,
  periodStart: isoDate,
  periodEnd: isoDate,
  basis: basis.optional(),
});

export const getReportingQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { reportingQueue } = await import("@/lib/financial-reporting.server");
    return reportingQueue(context.userId, data.fundId);
  });

export const getFinancialStatements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => periodInput.parse(data))
  .handler(async ({ data, context }) => {
    const { financialStatementsForPeriod } = await import("@/lib/financial-reporting.server");
    return financialStatementsForPeriod(context.userId, data.fundId, {
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      ...(data.basis ? { basis: data.basis } : {}),
    });
  });

export const prepareStatements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    periodInput.extend({ statements: z.array(z.enum(STATEMENTS)).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { prepareFinancialStatements } = await import("@/lib/financial-reporting.server");
    const result = await prepareFinancialStatements(context.userId, {
      offeringId: data.fundId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      ...(data.basis ? { basis: data.basis } : {}),
      ...(data.statements ? { statements: data.statements } : {}),
    });
    return { reports: result.reports, exceptions: result.exceptions };
  });

export const decideFinancialReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        reportId: uuid,
        to: z.enum(FINANCIAL_REPORT_FLOW),
        reason: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { advanceFinancialReport } = await import("@/lib/financial-reporting.server");
    return advanceFinancialReport(context.userId, data.reportId, data.to, data.reason);
  });

export const amendFinancialReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ reportId: uuid, reason: z.string().min(10).max(2000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { reviseFinancialReport } = await import("@/lib/financial-reporting.server");
    return reviseFinancialReport(context.userId, data.reportId, data.reason);
  });

export const respondToFinancialReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        reportId: uuid,
        response: z.enum(["acknowledged", "challenged"]),
        note: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { managerRespondToReport } = await import("@/lib/financial-reporting.server");
    return managerRespondToReport(context.userId, data.reportId, data.response, data.note);
  });

export const setFinancialReportVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        reportId: uuid,
        managerVisible: z.boolean().optional(),
        investorVisible: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setReportVisibility } = await import("@/lib/financial-reporting.server");
    return setReportVisibility(context.userId, data.reportId, {
      ...(data.managerVisible === undefined ? {} : { managerVisible: data.managerVisible }),
      ...(data.investorVisible === undefined ? {} : { investorVisible: data.investorVisible }),
    });
  });

export const getFinancialReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ reportId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { financialReportDetail } = await import("@/lib/financial-reporting.server");
    return financialReportDetail(context.userId, data.reportId);
  });

export const getStatementLineProvenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ reportId: uuid, lineKey: z.string().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { statementLineProvenance } = await import("@/lib/financial-reporting.server");
    return statementLineProvenance(context.userId, data.reportId, data.lineKey);
  });

export const getTrialBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fundId: uuid, asOfDate: isoDate, periodStart: isoDate.optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { trialBalanceAsOf } = await import("@/lib/financial-reporting.server");
    return trialBalanceAsOf(context.userId, data.fundId, data.asOfDate, data.periodStart);
  });

export const getGeneralLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        periodStart: isoDate,
        periodEnd: isoDate,
        accountCode: z.string().max(24).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { generalLedgerForPeriod } = await import("@/lib/financial-reporting.server");
    return generalLedgerForPeriod(context.userId, data.fundId, {
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      ...(data.accountCode ? { accountCode: data.accountCode } : {}),
    });
  });

export const getJournalRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fundId: uuid, periodStart: isoDate, periodEnd: isoDate }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { journalRegister } = await import("@/lib/financial-reporting.server");
    return journalRegister(context.userId, data.fundId, data);
  });

export const getScheduleOfInvestments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid, asOfDate: isoDate }).parse(data))
  .handler(async ({ data, context }) => {
    const { scheduleOfInvestmentsAsOf } = await import("@/lib/financial-reporting.server");
    return scheduleOfInvestmentsAsOf(context.userId, data.fundId, data.asOfDate);
  });

export const getCloseChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid, periodEnd: isoDate }).parse(data))
  .handler(async ({ data, context }) => {
    const { ensureCloseChecklist } = await import("@/lib/financial-reporting.server");
    return ensureCloseChecklist(context.userId, data.fundId, data.periodEnd);
  });

export const updateCloseChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        itemId: uuid,
        status: z.enum(["pending", "complete", "waived"]),
        reason: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setCloseChecklistItem } = await import("@/lib/financial-reporting.server");
    return setCloseChecklistItem(context.userId, data);
  });

export const buildWorkpapers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => periodInput.parse(data))
  .handler(async ({ data, context }) => {
    const { generateWorkpapers } = await import("@/lib/financial-reporting.server");
    return generateWorkpapers(context.userId, {
      offeringId: data.fundId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });
  });

export const listFundWorkpapers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fundId: uuid, periodEnd: isoDate.optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { listWorkpapers } = await import("@/lib/financial-reporting.server");
    return listWorkpapers(context.userId, data.fundId, data.periodEnd);
  });

export const decideWorkpaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        workpaperId: uuid,
        to: z.enum(WORKPAPER_STATUSES),
        note: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { advanceWorkpaper } = await import("@/lib/financial-reporting.server");
    return advanceWorkpaper(context.userId, data.workpaperId, data.to, data.note);
  });

export const listStatementMappingVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { listStatementMappings } = await import("@/lib/financial-reporting.server");
    return listStatementMappings(context.userId, data.fundId);
  });

export const getManagerFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { managerFinancials } = await import("@/lib/financial-reporting.server");
    return managerFinancials(context.userId, data.fundId);
  });

export const getInvestorFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { investorFinancials } = await import("@/lib/financial-reporting.server");
    return investorFinancials(context.userId);
  });

export const createReportPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        name: z.string().min(1).max(160),
        packageType: z.enum(["quarterly_lp", "internal_accounting", "audit", "custom"]),
        audience: z.enum(["harmonious", "manager", "investor"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveReportPackage } = await import("@/lib/financial-reporting.server");
    return saveReportPackage(context.userId, {
      offeringId: data.fundId,
      name: data.name,
      packageType: data.packageType,
      audience: data.audience,
    });
  });

export const listFundReportPackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { listReportPackages } = await import("@/lib/financial-reporting.server");
    return listReportPackages(context.userId, data.fundId);
  });

export const runFundReportPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ packageId: uuid, periodStart: isoDate, periodEnd: isoDate }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { runReportPackage } = await import("@/lib/financial-reporting.server");
    return runReportPackage(context.userId, data);
  });
