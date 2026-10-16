import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth, requireSupabaseAuthUnverified } from "@/lib/require-auth";
import { CAP_TIERS, INVESTOR_SERVICING_KEYS, SERVICING_KEYS } from "@/lib/saas-order-model";

const srv = () => import("@/lib/saas-orders.server");
const selection = z.object({
  funds: z.number().int().min(0).max(50),
  servicing: z.enum(SERVICING_KEYS),
  capTable: z.enum(CAP_TIERS),
  investorServicing: z.enum(INVESTOR_SERVICING_KEYS).optional(),
  alaCarte: z.record(z.string().max(80), z.number().int().min(0).max(100)),
});
async function email(context: any) {
  const { data } = await context.supabase.auth.getUser();
  return (data?.user?.email ?? null) as string | null;
}

// New sign-ups haven't passed identity yet, so ordering uses the unverified middleware; access still waits on KYC.
export const signSaasOrderFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .inputValidator(z.object({
    companyName: z.string().trim().min(2).max(200), interval: z.enum(["annual", "quarterly"]), selection,
    signerName: z.string().trim().min(2).max(160), signerTitle: z.string().trim().max(120).optional(), msaAccepted: z.literal(true),
  }).parse)
  .handler(async ({ data, context }) => {
    let ip: string | null = null;
    try { const r = getRequest(); ip = r?.headers.get("cf-connecting-ip") ?? r?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null; } catch { /* none */ }
    return (await srv()).signOrder(context.userId, await email(context), { ...data, ip });
  });

export const startSaasCheckoutFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .inputValidator(z.object({ orderId: z.string().uuid(), environment: z.enum(["sandbox", "live"]), returnUrl: z.string().url().max(500) }).parse)
  .handler(async ({ data, context }) => (await srv()).startOrderCheckout(context.userId, await email(context), data.orderId, data.environment, data.returnUrl));

export const submitKybFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .inputValidator(z.object({
    orderId: z.string().uuid(), legalName: z.string().trim().min(2).max(200), ein: z.string().trim().min(9).max(12),
    formationState: z.string().trim().min(2).max(60), entityType: z.string().trim().min(2).max(60),
    owners: z.array(z.object({ name: z.string().trim().min(2).max(160), percent: z.number().min(0).max(100) })).min(1).max(10),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).submitKyb(context.userId, data.orderId, data));

export const mySaasSetupFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await srv()).mySetup(context.userId) as Promise<any>);

export const myEntitlementsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await srv()).myEntitlements(context.userId));

export const staffSaasOrdersFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).staffOrders(context.userId) as Promise<any>);

export const decideKybFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ orderId: z.string().uuid(), approve: z.boolean(), note: z.string().max(2000).nullable() }).parse)
  .handler(async ({ data, context }) => (await srv()).decideKyb(context.userId, data.orderId, data.approve, data.note));

export const legalReviewSaasOrderFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ orderId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).markLegalReviewed(context.userId, data.orderId));
