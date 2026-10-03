import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const F = () => import("@/lib/email-flows.server");
const id = z.object({ id: z.string().uuid() });

export const getFlows = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await F()).listFlows(context.userId));

export const getFlow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d))
  .handler(async ({ data, context }) => (await F()).getFlow(context.userId, data.id));

export const saveFlow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().nullish(), name: z.string().min(1).max(200), description: z.string().max(2000).nullish(),
    audience: z.enum(["prospect", "client", "any"]), triggerKind: z.enum(["manual", "stage_change", "client_signed", "email_click"]),
    triggerStage: z.string().max(40).nullish(),
    steps: z.array(z.object({ delayDays: z.number().int().min(0).max(365), subject: z.string().max(300), body: z.string().max(10000) })).min(1).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => (await F()).saveFlow(context.userId, data));

export const setFlowStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "archived"]) }).parse(d))
  .handler(async ({ data, context }) => (await F()).setFlowStatus(context.userId, data.id, data.status));

export const enrollInFlow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ flowId: z.string().uuid(), contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await F()).enrollContact(context.userId, data));

export const getMyFollowUps = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await F()).myFollowUps(context.userId));

export const actOnFollowUp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enrollmentId: z.string().uuid(), action: z.enum(["send", "skip", "stop"]), subject: z.string().max(300).nullish(), body: z.string().max(10000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await F()).actOnFollowUp(context.userId, data));

export const getMarketingEngagement = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await F()).marketingEngagement(context.userId));

export const getSalesEngagement = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await F()).salesEngagement(context.userId));
