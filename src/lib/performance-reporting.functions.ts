import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FUND_TYPES, PERFORMANCE_STATUSES, PERIOD_KINDS } from "@/lib/performance-model";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const periodInput = z.object({
  fundId: uuid,
  periodKind: z.enum(PERIOD_KINDS),
  periodEnd: isoDate,
  periodStart: isoDate.optional(),
});

export const getPerformanceQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { performanceQueue } = await import("@/lib/performance.server");
    return performanceQueue(context.userId, data.fundId);
  });

export const previewPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => periodInput.parse(data))
  .handler(async ({ data, context }) => {
    const { calculatePerformance } = await import("@/lib/performance.server");
    return calculatePerformance(context.userId, {
      offeringId: data.fundId,
      periodKind: data.periodKind,
      periodEnd: data.periodEnd,
      ...(data.periodStart ? { periodStart: data.periodStart } : {}),
    });
  });

export const preparePerformanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => periodInput.parse(data))
  .handler(async ({ data, context }) => {
    const { preparePerformance } = await import("@/lib/performance.server");
    const result = await preparePerformance(context.userId, {
      offeringId: data.fundId,
      periodKind: data.periodKind,
      periodEnd: data.periodEnd,
      ...(data.periodStart ? { periodStart: data.periodStart } : {}),
    });
    return {
      runId: result.runId,
      exceptions: result.calculation.exceptions,
      periodLabel: result.calculation.periodLabel,
    };
  });

export const decidePerformanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId: uuid,
        to: z.enum(PERFORMANCE_STATUSES),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { advancePerformanceRun } = await import("@/lib/performance.server");
    return advancePerformanceRun(context.userId, data.runId, data.to, data.reason);
  });

export const amendPerformanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ runId: uuid, reason: z.string().trim().min(10).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { revisePerformanceRun } = await import("@/lib/performance.server");
    return revisePerformanceRun(context.userId, data.runId, data.reason);
  });

export const respondToPerformanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId: uuid,
        response: z.enum(["acknowledged", "challenged"]),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { managerRespondToPerformance } = await import("@/lib/performance.server");
    return managerRespondToPerformance(context.userId, data.runId, data.response, data.note);
  });

export const setPerformanceReportVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId: uuid,
        managerVisible: z.boolean().optional(),
        investorVisible: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setPerformanceVisibility } = await import("@/lib/performance.server");
    return setPerformanceVisibility(context.userId, data.runId, {
      ...(data.managerVisible === undefined ? {} : { managerVisible: data.managerVisible }),
      ...(data.investorVisible === undefined ? {} : { investorVisible: data.investorVisible }),
    });
  });

export const getPerformanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ runId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { performanceRunDetail } = await import("@/lib/performance.server");
    return performanceRunDetail(context.userId, data.runId);
  });

export const getPerformanceProvenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ runId: uuid, metricKey: z.string().trim().min(1).max(60) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { performanceProvenance } = await import("@/lib/performance.server");
    return performanceProvenance(context.userId, data.runId, data.metricKey);
  });

export const getManagerPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { managerPerformance } = await import("@/lib/performance.server");
    return managerPerformance(context.userId, data.fundId);
  });

export const getInvestorPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { investorPerformanceView } = await import("@/lib/performance.server");
    return investorPerformanceView(context.userId);
  });

export const listPerformanceMethodologies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { listMethodologies } = await import("@/lib/performance.server");
    return listMethodologies(context.userId, data.fundId);
  });

export const savePerformanceMethodology = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        label: z.string().trim().min(3).max(160),
        fundType: z.enum(FUND_TYPES),
        calculationMethod: z.enum(["capital_flows", "time_weighted", "both"]).optional(),
        deductManagementFees: z.boolean().optional(),
        deductFundExpenses: z.boolean().optional(),
        deductCarriedInterest: z.boolean().optional(),
        capitalDefinition: z.enum(["paid_in", "commitment"]).optional(),
        effectiveFrom: isoDate,
        notes: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveMethodology } = await import("@/lib/performance.server");
    const { fundId, ...rest } = data;
    return saveMethodology(context.userId, {
      offeringId: fundId,
      label: rest.label,
      fundType: rest.fundType,
      effectiveFrom: rest.effectiveFrom,
      ...(rest.calculationMethod ? { calculationMethod: rest.calculationMethod } : {}),
      ...(rest.deductManagementFees === undefined
        ? {}
        : { deductManagementFees: rest.deductManagementFees }),
      ...(rest.deductFundExpenses === undefined
        ? {}
        : { deductFundExpenses: rest.deductFundExpenses }),
      ...(rest.deductCarriedInterest === undefined
        ? {}
        : { deductCarriedInterest: rest.deductCarriedInterest }),
      ...(rest.capitalDefinition ? { capitalDefinition: rest.capitalDefinition } : {}),
      ...(rest.notes ? { notes: rest.notes } : {}),
    });
  });

export const savePerformanceBenchmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        name: z.string().trim().min(2).max(120),
        source: z.string().trim().min(2).max(120),
        methodology: z.string().trim().max(300).optional(),
        periodStart: isoDate,
        periodEnd: isoDate,
        returnBps: z.number().int().optional(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveBenchmark } = await import("@/lib/performance.server");
    const { fundId, ...rest } = data;
    return saveBenchmark(context.userId, {
      offeringId: fundId,
      name: rest.name,
      source: rest.source,
      periodStart: rest.periodStart,
      periodEnd: rest.periodEnd,
      ...(rest.methodology ? { methodology: rest.methodology } : {}),
      ...(rest.returnBps === undefined ? {} : { returnBps: rest.returnBps }),
      ...(rest.note ? { note: rest.note } : {}),
    });
  });

export const getPerformanceConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { getPerformanceConfig } = await import("@/lib/performance.server");
    return getPerformanceConfig(context.userId, data.fundId);
  });

export const savePerformanceConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        fundType: z.enum(FUND_TYPES).optional(),
        enabledMetrics: z.array(z.string()).optional(),
        defaultFrequency: z.enum(PERIOD_KINDS).optional(),
        managerResponseEnabled: z.boolean().optional(),
        investorReportingEnabled: z.boolean().optional(),
        blockingExceptionKinds: z.array(z.string()).optional(),
        largeMovementThresholdBps: z.number().int().min(0).max(1000000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { updatePerformanceConfig } = await import("@/lib/performance.server");
    const { fundId, ...rest } = data;
    return updatePerformanceConfig(context.userId, {
      offeringId: fundId,
      ...(rest.fundType ? { fundType: rest.fundType } : {}),
      ...(rest.enabledMetrics ? { enabledMetrics: rest.enabledMetrics } : {}),
      ...(rest.defaultFrequency ? { defaultFrequency: rest.defaultFrequency } : {}),
      ...(rest.managerResponseEnabled === undefined
        ? {}
        : { managerResponseEnabled: rest.managerResponseEnabled }),
      ...(rest.investorReportingEnabled === undefined
        ? {}
        : { investorReportingEnabled: rest.investorReportingEnabled }),
      ...(rest.blockingExceptionKinds
        ? { blockingExceptionKinds: rest.blockingExceptionKinds }
        : {}),
      ...(rest.largeMovementThresholdBps === undefined
        ? {}
        : { largeMovementThresholdBps: rest.largeMovementThresholdBps }),
    });
  });
