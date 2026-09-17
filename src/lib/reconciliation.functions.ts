import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CASH_TRANSACTION_TYPES } from "@/lib/reconciliation-model";

const uuid = z.string().uuid();
const txnType = z.enum(CASH_TRANSACTION_TYPES);

export const runCashClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { classifyFundCash } = await import("@/lib/reconciliation.server");
    return classifyFundCash(context.userId, data.fundId);
  });

export const getReconciliationQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fundId: uuid.optional(), status: z.string().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { reconciliationQueue } = await import("@/lib/reconciliation.server");
    return reconciliationQueue(context.userId, {
      ...(data.fundId ? { offeringId: data.fundId } : {}),
      ...(data.status ? { status: data.status } : {}),
    });
  });

export const getReconciliationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { reconciliationHistory } = await import("@/lib/reconciliation.server");
    return reconciliationHistory(context.userId, data.id);
  });

export const decideReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        action: z.enum(["approve", "correct", "reject", "leave_unmatched", "request_information"]),
        reason: z.string().max(2000).optional(),
        message: z.string().max(2000).optional(),
        correction: z
          .object({
            transactionType: txnType.optional(),
            applicationId: uuid.nullable().optional(),
            investorUserId: uuid.nullable().optional(),
            investmentProfileId: uuid.nullable().optional(),
            invoiceId: uuid.nullable().optional(),
            wireRequestId: uuid.nullable().optional(),
            debitAccountCode: z.string().max(20).optional(),
            creditAccountCode: z.string().max(20).optional(),
          })
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { reviewReconciliation } = await import("@/lib/reconciliation.server");
    return reviewReconciliation(context.userId, {
      reconciliationId: data.id,
      action: data.action === "correct" ? "approve" : data.action,
      ...(data.reason ? { reason: data.reason } : {}),
      ...(data.message ? { message: data.message } : {}),
      ...(data.correction ? { correction: data.correction } : {}),
    });
  });

export const approveReconciliationAsParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ id: uuid, decision: z.enum(["approve", "reject"]), reason: z.string().max(2000).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { externalApproveReconciliation } = await import("@/lib/reconciliation.server");
    return externalApproveReconciliation(context.userId, {
      reconciliationId: data.id,
      decision: data.decision,
      ...(data.reason ? { reason: data.reason } : {}),
    });
  });

export const prepareJournalForItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { prepareReconciliationJournal } = await import("@/lib/reconciliation.server");
    return prepareReconciliationJournal(context.userId, data.id);
  });

export const advanceJournalForItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, to: z.enum(["reviewed", "approved", "posted"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { advanceReconciliationJournal } = await import("@/lib/reconciliation.server");
    return advanceReconciliationJournal(context.userId, data.id, data.to);
  });

export const reverseReconciliationPosting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid, reason: z.string().min(4).max(2000) }).parse(data))
  .handler(async ({ data, context }) => {
    const { reverseAndCorrectReconciliation } = await import("@/lib/reconciliation.server");
    return reverseAndCorrectReconciliation(context.userId, data.id, data.reason);
  });

export const getAccountingExceptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { exceptionQueue } = await import("@/lib/reconciliation.server");
    return exceptionQueue(context.userId, data.fundId ? { offeringId: data.fundId } : {});
  });

export const closeAccountingException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["resolved", "waived", "investigating"]),
        note: z.string().max(2000).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { resolveException } = await import("@/lib/reconciliation.server");
    return resolveException(context.userId, data.id, data.status, data.note);
  });

export const getAccountingOperations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { accountingOperations } = await import("@/lib/reconciliation.server");
    return accountingOperations(context.userId, data.fundId);
  });

export const getCloseReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ periodId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { closeReadinessForPeriod } = await import("@/lib/reconciliation.server");
    return closeReadinessForPeriod(context.userId, data.periodId);
  });

export const getPostingRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: uuid.optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { listPostingRules } = await import("@/lib/reconciliation.server");
    return listPostingRules(context.userId, data.fundId);
  });

export const savePostingRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        supersedesId: uuid.nullable().optional(),
        offeringId: uuid.nullable().optional(),
        name: z.string().min(2).max(120),
        transactionType: txnType,
        direction: z.enum(["inflow", "outflow", "any"]),
        debitAccountCode: z.string().min(1).max(20),
        creditAccountCode: z.string().min(1).max(20),
        approvalRequired: z.enum(["none", "fund_manager", "client"]),
        approvalThresholdCents: z.number().int().nonnegative().nullable().optional(),
        priority: z.number().int().min(1).max(999).optional(),
        notes: z.string().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { savePostingRule } = await import("@/lib/reconciliation.server");
    return savePostingRule(context.userId, data);
  });

/** The items waiting on this fund manager or client, and nothing else. */
export const getMyReconciliationApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { reconciliationQueue } = await import("@/lib/reconciliation.server");
    const rows = await reconciliationQueue(context.userId, { status: "harmonious_reviewed" });
    return rows;
  });
