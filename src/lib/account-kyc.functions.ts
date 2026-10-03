import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuthUnverified } from "@/lib/require-auth";

const srv = () => import("@/lib/account-kyc.server");

export const accountKycStatusFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await srv()).reconcileAccountCheck(context.userId));

export const startAccountCheckFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => {
    let origin = "https://app.harmonious.co";
    try { const r = getRequest(); if (r?.url) origin = new URL(r.url).origin; } catch { /* default */ }
    return (await srv()).startAccountCheck(context.userId, origin);
  });

export const accountCheckQueueFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await srv()).accountCheckQueue(context.userId) as Promise<any[]>);

export const decideAccountCheckFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .inputValidator(z.object({ checkId: z.string().uuid(), action: z.enum(["approve", "decline", "send_back"]), note: z.string().max(2000).nullable() }).parse)
  .handler(async ({ data, context }) => (await srv()).decideAccountCheck(context.userId, data.checkId, data.action, data.note));
