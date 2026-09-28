import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const srv = () => import("@/lib/fund-onboarding-link.server");
const offering = z.object({ offeringId: z.string().uuid() });
const token = z.object({ token: z.string().max(64) });

/** Hashed caller key for abuse limits; raw IPs are never stored. */
async function callerHash() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fund-link:${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const getFundLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(offering.parse)
  .handler(async ({ data, context }) => (await srv()).getFundLink(context.userId, data.offeringId));

export const regenerateFundLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(offering.parse)
  .handler(async ({ data, context }) => (await srv()).regenerateFundLink(context.userId, data.offeringId));

export const setFundLinkEnabledFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(offering.extend({ enabled: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await srv()).setFundLinkEnabled(context.userId, data.offeringId, data.enabled));

export const resolveFundLinkFn = createServerFn({ method: "POST" }).inputValidator(token.parse)
  .handler(async ({ data }) => (await srv()).resolvePublicLink(data.token, await callerHash()));

export const startFromFundLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(token.parse)
  .handler(async ({ data, context }) => (await srv()).startFromLink(context.userId, data.token, await callerHash()));
