import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { adoptedSignatureSchema } from "@/lib/adopted-signature";
const fund = z.object({ offeringId: z.string().uuid() });
export const fundW9StateFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.parse)
  .handler(async ({ context, data }) => (await import("@/lib/fund-w9.server")).w9State(context.supabase, context.userId, data.offeringId));
export const prepareFundW9Fn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.extend({ signerId: z.string().uuid(), classification: z.enum(["partnership", "c_corp", "s_corp", "trust", "llc"]), llcClass: z.enum(["C", "S", "P"]).optional() }).parse)
  .handler(async ({ context, data }) => (await import("@/lib/fund-w9.server")).prepareW9(context.supabase, context.userId, data.offeringId, data.signerId, data.classification, data.llcClass));
export const signFundW9Fn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.extend({ requestId: z.string().uuid(), signedName: z.string().trim().min(2).max(200), signature: adoptedSignatureSchema, consent: z.literal(true) }).parse)
  .handler(async ({ context, data }) => (await import("@/lib/fund-w9.server")).signW9(context.userId, data.offeringId, data.requestId, data.signedName, data.signature));
export const cancelFundW9Fn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(fund.extend({ requestId: z.string().uuid() }).parse)
  .handler(async ({ context, data }) => (await import("@/lib/fund-w9.server")).cancelW9(context.userId, data.offeringId, data.requestId));