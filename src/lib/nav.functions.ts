import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MANAGER_WORKFLOWS, NAV_CHECK_CODES, NAV_FREQUENCIES } from "@/lib/nav-model";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getNavQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { navQueue } = await import("@/lib/nav.server");
    return navQueue(context.userId, data.fundId);
  });

export const calculateFundNav = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        asOfDate: isoDate,
        frequency: z.enum(NAV_FREQUENCIES).optional(),
        unitsOutstanding: z.number().positive().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { calculateNAV } = await import("@/lib/nav.server");
    const result = await calculateNAV(context.userId, {
      offeringId: data.fundId,
      asOfDate: data.asOfDate,
      ...(data.frequency ? { frequency: data.frequency } : {}),
      ...(data.unitsOutstanding === undefined ? {} : { unitsOutstanding: data.unitsOutstanding }),
    });
    return { navId: result.nav.id as string, netAssetValueCents: result.package.netAssetValueCents };
  });

export const submitNav = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ navId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { submitNavForReview } = await import("@/lib/nav.server");
    return submitNavForReview(context.userId, data.navId);
  });

export const decideNav = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        navId: uuid,
        action: z.enum(["review", "approve", "return", "publish", "revise"]),
        reason: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const nav = await import("@/lib/nav.server");
    switch (data.action) {
      case "review":
        return nav.reviewNav(context.userId, data.navId);
      case "approve":
        return nav.approveNav(context.userId, data.navId);
      case "return":
        return nav.returnNavToDraft(context.userId, data.navId, data.reason ?? "");
      case "publish":
        return nav.publishNav(context.userId, data.navId);
      case "revise":
        return nav.reviseNav(context.userId, data.navId, data.reason ?? "");
    }
  });

export const overrideNavWarning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ navId: uuid, code: z.enum(NAV_CHECK_CODES), reason: z.string().min(8).max(2000) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { overrideNavCheck } = await import("@/lib/nav.server");
    return overrideNavCheck(context.userId, data.navId, data.code, data.reason);
  });

export const respondToNav = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        navId: uuid,
        action: z.enum(["acknowledge", "challenge", "approve"]),
        note: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { managerRespondToNav } = await import("@/lib/nav.server");
    return managerRespondToNav(context.userId, data.navId, data.action, data.note);
  });

export const getNavDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ navId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const nav = await import("@/lib/nav.server");
    const [inputs, bridge, exceptions] = await Promise.all([
      nav.getNAVInputs(context.userId, data.navId),
      nav.getNAVBridge(context.userId, data.navId),
      nav.getNAVExceptions(context.userId, data.navId),
    ]);
    return { inputs, bridge, exceptions };
  });

export const getNavAsOf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid, asOfDate: isoDate }).parse(data))
  .handler(async ({ data, context }) => {
    const { getNAVAsOf } = await import("@/lib/nav.server");
    return getNAVAsOf(context.userId, data.fundId, data.asOfDate);
  });

export const saveFundNavPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: uuid,
        frequency: z.enum(NAV_FREQUENCIES).optional(),
        unitAccounting: z.boolean().optional(),
        unreconciledCashToleranceCents: z.number().int().nonnegative().optional(),
        unpostedJournalToleranceCents: z.number().int().nonnegative().optional(),
        openItemToleranceCents: z.number().int().nonnegative().optional(),
        valuationStalenessDays: z.number().int().positive().optional(),
        blockingChecks: z.array(z.enum(NAV_CHECK_CODES)).optional(),
        managerWorkflow: z.enum(MANAGER_WORKFLOWS).optional(),
        managerApprovalRequired: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveNavPolicy } = await import("@/lib/nav.server");
    const { fundId, ...rest } = data;
    return saveNavPolicy(context.userId, { offeringId: fundId, ...rest });
  });
