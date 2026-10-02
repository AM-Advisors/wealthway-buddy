import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fund = z.object({ offeringId: uuid });
const S = () => import("@/lib/accounting-phase5.server");

export const listAccountingFundsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).listAccountingFunds(context.userId));

export const ledgerViewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ asOf: date.optional() }).parse(d))
  .handler(async ({ data, context }) => (await S()).ledgerView(context.userId, data.offeringId, data.asOf));

export const openBookFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.parse(d))
  .handler(async ({ data, context }) => (await S()).openBook(context.userId, data.offeringId));

const line = z.object({ accountId: uuid, debitCents: z.number().int().min(0), creditCents: z.number().int().min(0), memo: z.string().max(500).optional() });
export const draftManualEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ entryDate: date, memo: z.string().trim().min(1).max(500), lines: z.array(line).min(2).max(50) }).parse(d))
  .handler(async ({ data, context }) => (await S()).draftManualEntry(context.userId, data));

export const advanceEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ entryId: uuid, to: z.enum(["reviewed", "approved", "posted"]), reason: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => (await S()).advanceEntry(context.userId, data));

export const reverseEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ entryId: uuid, reason: z.string().trim().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).reverseEntry(context.userId, data));

export const qboViewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.parse(d))
  .handler(async ({ data, context }) => (await S()).qboView(context.userId, data.offeringId));

export const setQboLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ companyName: z.string().max(200), realmId: z.string().max(100).nullish(), status: z.enum(["linked", "unlinked"]), note: z.string().max(1000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).setQboLink(context.userId, data));

export const saveQboMappingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ qboAccountName: z.string().trim().min(1).max(200), accountId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await S()).saveQboMapping(context.userId, data));

export const importQboJournalFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ fileName: z.string().max(300), csv: z.string().min(1).max(5_000_000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).importQboJournalFile(context.userId, data));

export const createOutboundBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ entryIds: z.array(uuid).min(1).max(500), note: z.string().max(1000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).createOutboundBatch(context.userId, data));

export const decideOutboundBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ batchId: uuid, decision: z.enum(["approved", "declined"]), reason: z.string().max(1000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).decideOutboundBatch(context.userId, data));

export const downloadOutboundBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ batchId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await S()).downloadOutboundBatch(context.userId, data));

export const recordOutboundResultFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ batchId: uuid, entryId: uuid, outcome: z.enum(["sent", "failed", "already_in_qbo"]), qboTxnId: z.string().max(100).nullish(), detail: z.string().max(1000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).recordOutboundResult(context.userId, data));

export const runDriftCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ asOf: date, csv: z.string().min(1).max(5_000_000), explanation: z.string().max(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).runDriftCheck(context.userId, data));

export const explainDriftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ snapshotId: uuid, explanation: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).explainDrift(context.userId, data));

export const listBankAlertsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid.nullish(), includeResolved: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await S()).listBankAlerts(context.userId, data));

export const actOnBankAlertFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ alertId: uuid, action: z.enum(["acknowledged", "assigned", "resolved", "reopened"]), note: z.string().max(2000).nullish(), assigneeUserId: uuid.nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).actOnBankAlert(context.userId, data));

export const runBankAlertScanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.parse(d))
  .handler(async ({ data, context }) => (await S()).runBankAlertScan(context.userId, data.offeringId));

export const recordManualBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ asOf: date, balanceCents: z.number().int(), bankAccountId: uuid.nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).recordManualBalance(context.userId, data));

export const listCloseSheetsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.parse(d))
  .handler(async ({ data, context }) => (await S()).listCloseSheets(context.userId, data.offeringId));

export const prepareCloseSheetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.extend({ kind: z.enum(["investor_closing", "month_end"]), key: z.string().max(10), approvalDeadline: date.nullish(), note: z.string().max(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).prepareCloseSheet(context.userId, data));

export const decideCloseSheetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ versionId: uuid, decision: z.enum(["approved", "returned"]), reason: z.string().max(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).decideCloseSheet(context.userId, data));

export const managerCloseSheetsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fund.parse(d))
  .handler(async ({ data, context }) => (await S()).managerCloseSheets(context.userId, data.offeringId));
