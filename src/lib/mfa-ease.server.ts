// Server-only engine for the second-step ease options (trusted devices, emailed
// codes). Browser code goes through mfa-ease.functions.ts; other server modules
// may import these helpers directly.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { randomToken, readRequestGeo, recordSecurityEvent, sha256 } from "./account-security.server";
import {
  FALLBACK_CODE_TTL_MS,
  FALLBACK_MAX_ATTEMPTS,
  FALLBACK_SENDS_PER_HOUR,
  countRecentFallbackSends,
  isTrustedRowValid,
  trustedDeviceExpiry,
  type TrustedDeviceRowLike,
  type TrustedDeviceView,
} from "./mfa-ease";

const db = () => supabaseAdmin as any;

// ------------------------------------------------------------ trusted devices

export async function createTrustedDevice(userId: string, deviceId: string | null) {
  const token = randomToken(32);
  const geo = readRequestGeo();
  const expires_at = trustedDeviceExpiry();
  const { error } = await db().from("mfa_trusted_devices").insert({
    user_id: userId,
    token_hash: await sha256(token),
    device_id: deviceId ? deviceId.slice(0, 100) : null,
    user_agent: geo.userAgent,
    expires_at,
  });
  if (error) throw new Error(error.message);
  await recordSecurityEvent({ userId, eventType: "mfa_trusted_device_added", action: "device remembered for 30 days" });
  return { token, expiresAt: expires_at };
}

export async function checkTrustedDevice(userId: string, token: string) {
  if (!token || token.length > 200) return { trusted: false as const };
  const { data: row } = await db()
    .from("mfa_trusted_devices")
    .select("id, expires_at, revoked_at")
    .eq("token_hash", await sha256(token))
    .eq("user_id", userId)
    .maybeSingle();
  if (!isTrustedRowValid(row as TrustedDeviceRowLike | null)) return { trusted: false as const };
  await db().from("mfa_trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return { trusted: true as const, expiresAt: row.expires_at as string };
}

export async function listTrustedDevices(userId: string) {
  const { data } = await db()
    .from("mfa_trusted_devices")
    .select("id, device_id, user_agent, created_at, last_used_at, expires_at, revoked_at")
    .eq("user_id", userId)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .limit(20);
  return (data ?? []) as TrustedDeviceView[];
}

export async function revokeTrustedDevice(userId: string, id: string, reason: string) {
  const { error } = await db()
    .from("mfa_trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await recordSecurityEvent({ userId, eventType: "mfa_trusted_device_revoked", action: reason });
  return { ok: true as const };
}

export async function revokeAllTrustedDevices(userId: string, reason: string) {
  await db()
    .from("mfa_trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  await recordSecurityEvent({ userId, eventType: "mfa_trusted_device_revoked", action: reason });
  return { ok: true as const };
}

// ------------------------------------------------------------ emailed codes

function sixDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + ((buf[0] ?? 0) % 900000));
}

/** Emails a single-use 6-digit code to the account's verified address. Rate limited. */
export async function sendFallbackCode(
  userId: string,
  email: string | null | undefined,
  purpose: string,
  firstName: string | null,
) {
  if (!email) throw new Error("This account has no email address to send a code to.");
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent } = await db()
    .from("mfa_fallback_codes")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (countRecentFallbackSends((recent ?? []).map((r: any) => r.created_at)) >= FALLBACK_SENDS_PER_HOUR) {
    throw new Error("Too many code requests this hour. Try again a little later.");
  }
  // Any earlier pending codes for this purpose stop being usable.
  await db()
    .from("mfa_fallback_codes")
    .update({ status: "superseded" })
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .eq("status", "pending");

  const code = sixDigitCode();
  const expires_at = new Date(Date.now() + FALLBACK_CODE_TTL_MS).toISOString();
  const { error } = await db().from("mfa_fallback_codes").insert({
    user_id: userId,
    code_hash: await sha256(code),
    purpose,
    expires_at,
    sent_to: email.toLowerCase(),
  });
  if (error) throw new Error(error.message);

  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  await sendTemplateEmail("manager-alert", email, {
    templateData: {
      managerName: firstName ?? "there",
      headline: "Your Harmonious confirmation code",
      intro: `Use ${code} to confirm it's you. It expires in ten minutes and works once. If this was not you, do not use it - and contact operations@harmonious.co.`,
      details: [],
      portalUrl: "https://app.harmonious.co/security",
    },
  });
  await recordSecurityEvent({ userId, email, eventType: "mfa_fallback_code_sent", action: `code emailed (${purpose})` });
  return { sent: true as const, expiresAt: expires_at };
}

/** Verifies the emailed code. A wrong or stale code never becomes usable. */
export async function verifyFallbackCode(userId: string, code: string, purpose: string) {
  const { data: rows } = await db()
    .from("mfa_fallback_codes")
    .select("id, code_hash, attempts, expires_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (rows ?? [])[0];
  if (!row) throw new Error("That code is no longer valid. Request a new one.");
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db().from("mfa_fallback_codes").update({ status: "expired" }).eq("id", row.id);
    throw new Error("That code expired. Request a new one.");
  }
  if ((row.attempts ?? 0) >= FALLBACK_MAX_ATTEMPTS) {
    await db().from("mfa_fallback_codes").update({ status: "failed" }).eq("id", row.id);
    throw new Error("Too many attempts. Request a new code.");
  }
  if ((await sha256(code)) !== row.code_hash) {
    await db()
      .from("mfa_fallback_codes")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id);
    throw new Error("That code is not correct.");
  }
  await db().from("mfa_fallback_codes").update({ status: "used", used_at: new Date().toISOString() }).eq("id", row.id);
  await recordSecurityEvent({ userId, eventType: "mfa_verified", action: "email fallback code accepted" });
  return { ok: true as const };
}
