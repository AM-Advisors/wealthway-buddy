import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PACKAGE_SECTIONS,
  PACKAGE_STATUSES,
  PORTFOLIO_VISIBILITIES,
} from "@/lib/investor-reporting-model";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const frequency = z.enum(["month", "quarter", "year"]);

const viewerInput = z
  .object({
    onBehalfOfUserId: uuid.optional(),
    delegationId: uuid.optional(),
    organizationId: uuid.optional(),
  })
  .optional();

export const getInvestorReportingCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => viewerInput.parse(data ?? {}) ?? {})
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.investorReportingCenter(context.userId, data ?? {});
  });

export const getInvestorDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => viewerInput.parse(data ?? {}) ?? {})
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.investorDashboardSummary(context.userId, data ?? {});
  });

export const getInvestorPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        packageId: uuid,
        onBehalfOfUserId: uuid.optional(),
        delegationId: uuid.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    const { packageId, ...viewer } = data;
    return mod.investorPackageDetail(context.userId, packageId, viewer);
  });

export const recordPackageEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        packageId: uuid,
        event: z.enum(["downloaded", "acknowledged", "exported"]),
        onBehalfOfUserId: uuid.optional(),
        delegationId: uuid.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    const { packageId, event, ...viewer } = data;
    return mod.recordPackageInteraction(context.userId, packageId, event, viewer);
  });

export const getInvestorDocumentLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => viewerInput.parse(data ?? {}) ?? {})
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.investorDocumentLibrary(context.userId, data ?? {});
  });

export const getInvestorNotices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => viewerInput.parse(data ?? {}) ?? {})
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.investorNotices(context.userId, data ?? {});
  });

export const getReportingOperations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.reportingOperations(context.userId, data.fundId);
  });

export const getManagerPackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.managerPackages(context.userId, data.fundId);
  });

export const getPackageDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ packageId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.packageDetail(context.userId, data.packageId);
  });

export const generateInvestorPackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        periodKind: frequency,
        periodEnd: isoDate,
        periodStart: isoDate.optional(),
        templateId: uuid.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    const result = await mod.generatePackages(context.userId, {
      offeringId: data.fundId,
      periodKind: data.periodKind,
      periodEnd: data.periodEnd,
      ...(data.periodStart ? { periodStart: data.periodStart } : {}),
      ...(data.templateId ? { templateId: data.templateId } : {}),
    });
    return { created: result.created, periodLabel: result.periodLabel };
  });

export const decideInvestorPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        packageId: uuid,
        to: z.enum(PACKAGE_STATUSES),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.advancePackage(context.userId, data.packageId, data.to, data.reason);
  });

export const amendInvestorPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ packageId: uuid, reason: z.string().trim().min(10).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.revisePackage(context.userId, data.packageId, data.reason);
  });

export const respondToInvestorPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        packageId: uuid,
        response: z.enum(["acknowledged", "challenged"]),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.managerRespondToPackage(
      context.userId,
      data.packageId,
      data.response,
      data.note,
    );
  });

export const listReportingTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.listPackageTemplates(context.userId, data.fundId);
  });

export const saveReportingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        code: z.string().trim().min(2).max(60),
        name: z.string().trim().min(2).max(120),
        fundId: uuid.optional(),
        fundType: z.string().trim().max(40).optional(),
        investorClassId: uuid.optional(),
        frequency,
        sections: z.array(z.enum(PACKAGE_SECTIONS)).min(1),
        requiredComponents: z.array(z.enum(PACKAGE_SECTIONS)).optional(),
        portfolioDetail: z.enum(["policy", "none", "summary", "detail"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.savePackageTemplate(context.userId, {
      code: data.code,
      name: data.name,
      offeringId: data.fundId ?? null,
      fundType: data.fundType ?? null,
      investorClassId: data.investorClassId ?? null,
      frequency: data.frequency,
      sections: data.sections,
      ...(data.requiredComponents ? { requiredComponents: data.requiredComponents } : {}),
      ...(data.portfolioDetail ? { portfolioDetail: data.portfolioDetail } : {}),
    });
  });

export const saveReportingPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        portfolioVisibility: z.enum(PORTFOLIO_VISIBILITIES).optional(),
        administratorAttribution: z.string().trim().max(200).optional(),
        managerReviewEnabled: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.saveFundReportingPolicy(context.userId, {
      offeringId: data.fundId,
      ...(data.portfolioVisibility ? { portfolioVisibility: data.portfolioVisibility } : {}),
      ...(data.administratorAttribution !== undefined
        ? { administratorAttribution: data.administratorAttribution }
        : {}),
      ...(data.managerReviewEnabled !== undefined
        ? { managerReviewEnabled: data.managerReviewEnabled }
        : {}),
    });
  });

export const createInvestorNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        kind: z.enum([
          "capital_call",
          "distribution",
          "quarterly_report",
          "annual_report",
          "valuation",
          "amendment",
          "tax",
          "general",
        ]),
        title: z.string().trim().min(3).max(200),
        body: z.string().trim().max(5000).optional(),
        effectiveDate: isoDate.optional(),
        dueDate: isoDate.optional(),
        amountCents: z.number().int().optional(),
        requiresAcknowledgement: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.saveNotice(context.userId, {
      offeringId: data.fundId,
      kind: data.kind,
      title: data.title,
      ...(data.body ? { body: data.body } : {}),
      ...(data.effectiveDate ? { effectiveDate: data.effectiveDate } : {}),
      ...(data.dueDate ? { dueDate: data.dueDate } : {}),
      ...(data.amountCents !== undefined ? { amountCents: data.amountCents } : {}),
      ...(data.requiresAcknowledgement !== undefined
        ? { requiresAcknowledgement: data.requiresAcknowledgement }
        : {}),
    });
  });

export const publishInvestorNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ noticeId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/investor-reporting.server");
    return mod.publishNotice(context.userId, data.noticeId);
  });
