// Server functions for the second-step ease options (remembered devices and the
// emailed- or texted-code fallback). Called from the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, requireSupabaseAuthUnverified } from "./require-auth";

const srv = () => import("./mfa-ease.server");

/** The mobile number Operations holds for this account, if any. */
async function phoneForUser(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("persons").select("phone").eq("user_id", userId).limit(1);
  return data?.[0]?.phone ?? null;
}

/** Remember this device for 30 days. Requires a verified second step (aal2). */
export const rememberThisDeviceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    if ((context.claims as any)?.aal !== "aal2") throw new Error("Verify your second step first.");
    return (await srv()).createTrustedDevice(context.userId, data.deviceId ?? null);
  });

export const checkTrustedDeviceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .inputValidator((d) => z.object({ token: z.string().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).checkTrustedDevice(context.userId, data.token));

export const getMyTrustedDevicesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listTrustedDevices(context.userId));

export const revokeTrustedDeviceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().trim().max(200).default("removed by user") }).parse(d))
  .handler(async ({ data, context }) => (await srv()).revokeTrustedDevice(context.userId, data.id, data.reason));

export const revokeAllTrustedDevicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).revokeAllTrustedDevices(context.userId, "removed all devices"));

/** Emails a single-use 6-digit code to the signed-in account's verified address. */
export const requestMfaEmailCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .inputValidator((d) => z.object({ purpose: z.string().trim().max(60).default("step_up") }).parse(d))
  .handler(async ({ data, context }) => {
    const claims = context.claims as { email?: string; email_verified?: boolean };
    if (claims.email_verified === false) throw new Error("Confirm your email address first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: person } = await supabaseAdmin
      .from("persons")
      .select("legal_first_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    return (await srv()).sendFallbackCode(context.userId, claims.email ?? null, data.purpose, person?.legal_first_name ?? null);
  });

export const verifyMfaEmailCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .inputValidator((d) =>
    z.object({ code: z.string().trim().regex(/^\d{6}$/), purpose: z.string().trim().max(60).default("step_up") }).parse(d),
  )
  .handler(async ({ data, context }) => (await srv()).verifyFallbackCode(context.userId, data.code, data.purpose));

/**
 * Whether this account can be sent a text code, and where it would go. The
 * answer is false until Operations attaches a Twilio phone number to the
 * connected account AND a mobile number is on the person's record.
 */
export const getMfaSmsStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => {
    const { smsSenderConfig } = await srv();
    const { maskPhone, normalizeSmsPhone } = await import("./mfa-ease");
    const phone = normalizeSmsPhone(await phoneForUser(context.userId));
    return { enabled: !!smsSenderConfig() && !!phone, to: phone ? maskPhone(phone) : null };
  });

/** Texts a single-use 6-digit code to the mobile number on this account. */
export const requestMfaSmsCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .inputValidator((d) => z.object({ purpose: z.string().trim().max(60).default("step_up") }).parse(d))
  .handler(async ({ data, context }) => {
    const { sendSmsCode } = await srv();
    return sendSmsCode(context.userId, await phoneForUser(context.userId), data.purpose);
  });

export const verifyMfaSmsCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .inputValidator((d) =>
    z.object({ code: z.string().trim().regex(/^\d{6}$/), purpose: z.string().trim().max(60).default("step_up") }).parse(d),
  )
  .handler(async ({ data, context }) => (await srv()).verifySmsCode(context.userId, data.code, data.purpose));
