import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const srv = () => import("@/lib/statement-review.server");
const decision = z.enum(["approved", "returned"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const statementReviewQueueFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).statementReviewQueue(context.userId));

export const decideStatementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ statementId: z.string().uuid(), decision, note: z.string().max(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).decideStatement(context.userId, data));

export const notifyStatementsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid(), statementIds: z.array(z.string().uuid()).optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).notifyStatements(context.userId, data));

export const listReviewMemosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await srv()).listReviewMemos(context.userId, data.offeringId));

export const memoFiguresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid(), periodEnd: date }).parse(d))
  .handler(async ({ data, context }) => (await srv()).memoFigures(context.userId, data.offeringId, data.periodEnd));

export const saveReviewMemoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(), offeringId: z.string().uuid(), periodStart: date, periodEnd: date,
    title: z.string().min(3).max(200), summary: z.string().max(10000),
    findings: z.array(z.object({ area: z.string().max(100), observation: z.string().max(2000), action: z.string().max(2000).optional() })).max(50),
    reportIds: z.array(z.string().uuid()).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveReviewMemo(context.userId, data));

export const decideReviewMemoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), decision, note: z.string().max(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).decideReviewMemo(context.userId, data));

export const notifyReviewMemoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).notifyReviewMemo(context.userId, data.id));
