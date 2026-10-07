import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/ops-command.server");

export const getOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => z.object({ includeTest: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => (await srv()).loadOperations(context.userId, data));

export const getDailyDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => (await srv()).dailyDigest(context.userId));

export const opsBulkAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ action: z.enum(["assign", "team", "priority", "follow_up", "acknowledge"]), value: z.string().max(100).nullable().optional(),
    items: z.array(z.object({ kind: z.string(), id: z.string(), ref: z.string().optional(), type: z.string().optional(), fundId: z.string().nullable().optional(), title: z.string().max(300).optional() })).max(200) }).parse(d))
  .handler(async ({ context, data }) => (await srv()).bulkAction(context.userId, data));

export const opsSetException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ type: z.string(), ref: z.string(), fundId: z.string().nullable().optional(), title: z.string().max(300), status: z.enum(["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "DISMISSED"]), resolution: z.string().max(2000).nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).setExceptionStatus(context.userId, data));

export const opsClientActionStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: z.string().uuid(), step: z.enum(["reminder", "follow_up", "escalate"]), date: z.string().nullable().optional(), note: z.string().max(1000).nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).clientActionStep(context.userId, data));

export const opsSetServiceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.string(), note: z.string().max(2000).nullable().optional(), ownerUserId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).setServiceReviewStatus(context.userId, data));

export const opsSyncServiceReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => (await srv()).syncServiceReviews(context.userId));

export const opsUpdateSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string(), value: z.unknown().refine((v) => v !== undefined), reason: z.string().max(1000) }).parse(d))
  .handler(async ({ context, data }) => (await srv()).updateOpsSetting(context.userId, data));

export const opsSavedViews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => (await srv()).savedViews(context.userId));
export const opsSaveView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ view: z.string().max(40), name: z.string().min(1).max(80), filters: z.record(z.string(), z.string()) }).parse(d))
  .handler(async ({ context, data }) => (await srv()).saveView(context.userId, data));
export const opsDeleteView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).deleteView(context.userId, data.id));
