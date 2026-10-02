import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const engine = () => import("@/lib/fund-duplicate-resolution.server");
const uuid = z.string().uuid();
const conflictKinds = z.enum(["legal_name", "ein", "entity", "banking", "economics", "duplicate_investment", "documents", "managers", "regulatory", "drive", "client"]);

export const listFundDuplicatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await engine()).listDuplicatePairs(context));

export const compareFundDuplicatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundIds: z.array(uuid).length(2) }).parse(d))
  .handler(async ({ context, data }) => (await engine()).getComparison(context, data.fundIds));

export const decideFundDuplicateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      fundIds: z.array(uuid).length(2),
      decision: z.enum(["same_fund", "different_funds", "needs_review"]),
      canonicalId: uuid.nullish(),
      note: z.string().max(1000).nullish(),
      acknowledged: z.array(conflictKinds).max(20).optional(),
    }).parse(d))
  .handler(async ({ context, data }) => (await engine()).decidePair(context, data));

export const completeKeepSeparateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reviewId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await engine()).completeKeepSeparate(context, data.reviewId));

export const previewConsolidationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reviewId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await engine()).previewConsolidation(context, data.reviewId));

export const confirmConsolidationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ reviewId: uuid, canonicalId: uuid, duplicateId: uuid, reason: z.string().trim().min(5).max(1000), confirmed: z.literal(true), version: z.number().int().min(1) }).parse(d))
  .handler(async ({ context, data }) => (await engine()).confirmConsolidation(context, data));

/** Returns the canonical Fund ID only when the caller can already read that Fund under normal access rules. */
export const resolveFundAliasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const canonical = await (await engine()).resolveFundAlias(data.fundId);
    const { data: row } = await (context as any).supabase.from("offerings").select("id").eq("id", canonical).maybeSingle();
    return { fundId: row ? canonical : null, redirected: !!row && canonical !== data.fundId };
  });
