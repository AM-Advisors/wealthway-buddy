import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const s = () => import("@/lib/linkedin-personal.server");
const perm = z.enum(["view", "create", "edit", "submit", "propose_schedule", "schedule", "publish_approved", "publish_direct"]);

export const getLinkedInPersonal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await s()).overview(context.userId));
export const startLinkedInPersonalConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ url: await (await s()).connectUrl(context.userId) }));
export const disconnectLinkedInPersonal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await s()).disconnect(context.userId));
export const setLinkedInDelegate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    delegateId: z.string().uuid(), perms: z.record(perm, z.boolean()), authorizeDirect: z.boolean().optional(),
    expires_at: z.string().nullable().optional(), max_posts_per_day: z.number().int().min(1).max(50).nullable().optional(),
    series: z.array(z.string().max(60)).max(10).nullable().optional(),
    hours_start: z.number().int().min(0).max(23).nullable().optional(), hours_end: z.number().int().min(0).max(24).nullable().optional(),
    suspended: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await s()).setDelegate(context.userId, data as any));
export const revokeLinkedInDelegate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ delegateId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await s()).revokeDelegate(context.userId, data.delegateId));
export const createLinkedInPersonalPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ body: z.string().min(1).max(3000), series: z.string().max(60).nullable() }).parse(d))
  .handler(async ({ data, context }) => (await s()).createPost(context.userId, data.body, data.series));
export const editLinkedInPersonalPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), body: z.string().min(1).max(3000) }).parse(d))
  .handler(async ({ data, context }) => (await s()).editPost(context.userId, data.id, data.body));
export const linkedInPersonalPostAction = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    action: z.enum(["submit", "approve", "reject", "request_changes", "schedule", "propose_schedule", "cancel_schedule", "cancel", "publish_now"]),
    at: z.string().nullable().optional(), note: z.string().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await s()).postAction(context.userId, data.id, data.action, data.at, data.note));
export const setLinkedInPersonalPaused = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paused: z.boolean(), reason: z.string().max(500).nullable() }).parse(d))
  .handler(async ({ data, context }) => (await s()).setPaused(context.userId, data.paused, data.reason));
export const setLinkedInPersonalTimezone = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ timezone: z.string().max(60).nullable() }).parse(d))
  .handler(async ({ data, context }) => (await s()).setAccountTimezone(context.userId, data.timezone));
