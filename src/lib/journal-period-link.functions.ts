import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

/**
 * Historical journal-to-period linking. All rules (eligibility, immutable
 * proposal hash, distinct preparer/reviewer/applier, atomic apply, append-only
 * events) are enforced in the database functions; this layer only checks
 * Harmonious accounting authority before calling them.
 */
async function adminOnly(userId: string) {
  const { reviewerScope } = await import("@/lib/reviewer-authz.server");
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) throw new Error("Forbidden: Harmonious accounting authority required.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const id = z.string().uuid();

export const previewPeriodLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ periodId: id }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminOnly(context.userId);
    const { data: rows, error } = await db.rpc("evaluate_journal_period_links", { _period: data.periodId });
    if (error) throw new Error(error.message);
    return rows as Array<Record<string, string | number | boolean | null>>;
  });

export const preparePeriodLinkBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ periodId: id, reason: z.string().min(3), source: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminOnly(context.userId);
    const { data: batch, error } = await db.rpc("prepare_journal_period_link_batch", {
      _period: data.periodId, _actor: context.userId, _reason: data.reason, _source: data.source,
    });
    if (error) throw new Error(error.message);
    return { batchId: batch as string };
  });

export const reviewPeriodLinkBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ batchId: id, decision: z.enum(["approved", "rejected"]), note: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminOnly(context.userId);
    const { error } = await db.rpc("review_journal_period_link_batch", {
      _batch: data.batchId, _actor: context.userId, _decision: data.decision, _note: data.note,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const applyPeriodLinkBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ batchId: id, expectedHash: z.string().min(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminOnly(context.userId);
    const { data: res, error } = await db.rpc("apply_journal_period_link_batch", {
      _batch: data.batchId, _actor: context.userId, _expected_hash: data.expectedHash,
    });
    if (error) throw new Error(error.message);
    return res as { applied: number; idempotent: boolean };
  });

export const getPeriodLinkBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ batchId: id }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminOnly(context.userId);
    const { data: b, error } = await db
      .from("journal_period_link_batches")
      .select("id, status, reason, source, proposal_hash, entry_count, prepared_by, prepared_at, reviewed_by, reviewed_at, review_note, applied_by, applied_at, proposal, excluded, accounting_periods(label, period_start, period_end, status)")
      .eq("id", data.batchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!b) throw new Error("Batch not found.");
    return JSON.parse(JSON.stringify({ ...b, me: context.userId })) as PeriodLinkBatch;
  });

export type PeriodLinkBatch = {
  id: string; status: string; reason: string; source: string; proposal_hash: string; entry_count: number;
  prepared_by: string; prepared_at: string; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null;
  applied_by: string | null; applied_at: string | null; me: string;
  proposal: Array<{ entry_id: string; entry_no: number; entry_date: string; debit_cents: number; credit_cents: number }>;
  excluded: Array<{ entry_id: string; entry_no: number; entry_date: string; status: string; reason: string }>;
  accounting_periods: { label: string; period_start: string; period_end: string; status: string } | null;
};
