// Server-only engine for the second-step ease options (trusted devices, emailed
// codes and texted codes). Browser code goes through mfa-ease.functions.ts; other
// server modules may import these helpers directly.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { randomToken, readRequestGeo, recordSecurityEvent, sha256 } from "./account-security.server";
import {
  FALLBACK_CODE_TTL_MS,
  FALLBACK_MAX_ATTEMPTS,
  FALLBACK_SENDS_PER_HOUR,
  countRecentFallbackSends,
  isTrustedRowValid,
  maskPhone,
  normalizeSmsPhone,
  pickSmsSender,
  smsPurpose,
  trustedDeviceExpiry,
  type SmsSender,
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

// ------------------------------------------------------------ one-time codes

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function sixDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + ((buf[0] ?? 0) % 900000));
}

/**
 * Which sender the app may text from. Null until Operations attaches a Twilio
 * phone number (TWILIO_FROM_NUMBER) or a messaging service (TWILIO_MESSAGING_SERVICE_SID)
 * to the connected Twilio account - a connected account with no number cannot
 * originate messages.
 */
export function smsSenderConfig(): SmsSender | null {
  return pickSmsSender({
    TWILIO_FROM_NUMBER: process.env["TWILIO_FROM_NUMBER"] ?? "",
    TWILIO_MESSAGING_SERVICE_SID: process.env["TWILIO_MESSAGING_SERVICE_SID"] ?? "",
  });
}

/**
 * Shared issue path for a single-use code: hourly cap, supersede anything still
 * pending for this purpose, store only the hash, then hand the code to `deliver`.
 */
async function issueCode(
  userId: string,
  purpose: string,
  target: string,
  deliver: (code: string) => Promise<unknown>,
) {
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
    sent_to: target,
  });
  if (error) throw new Error(error.message);
  await deliver(code);
  return { sent: true as const, expiresAt: expires_at };
}

/** Emails a single-use 6-digit code to the account's verified address. Rate limited. */
export async function sendFallbackCode(
  userId: string,
  email: string | null | undefined,
  purpose: string,
  firstName: string | null,
) {
  if (!email) throw new Error("This account has no email address to send a code to.");
  const result = await issueCode(userId, purpose, email.toLowerCase(), async (code) => {
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
  });
  await recordSecurityEvent({ userId, email, eventType: "mfa_fallback_code_sent", action: `code emailed (${purpose})` });
  return result;
}

/** Sends one text through the connected Twilio account via the connector gateway. */
async function sendSms(to: string, body: string) {
  const sender = smsSenderConfig();
  if (!sender) {
    throw new Error("Text messages aren't turned on yet. Ask Operations to add a Twilio phone number.");
  }
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const twilioKey = process.env["TWILIO_API_KEY"];
  if (!lovableKey || !twilioKey) throw new Error("Text messaging isn't configured on this server.");

  const form = new URLSearchParams({ To: to, Body: body });
  if ("from" in sender) form.set("From", sender.from);
  else form.set("MessagingServiceSid", sender.messagingServiceSid);

  const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) {
    // Twilio's own status and reason stay in the server log; the person gets a
    // plain message so a carrier or account problem never reads as their fault.
    console.error(`Twilio text failed [${response.status}]: ${text}`);
    throw new Error("That text didn't go out. Try the email code instead.");
  }
  let sid = "";
  try {
    sid = String(JSON.parse(text)?.sid ?? "");
  } catch {
    /* Twilio answered something we don't recognize; treat it as undelivered below. */
  }
  if (!sid) {
    console.error(`Twilio text returned no message id: ${text.slice(0, 300)}`);
    throw new Error("That text didn't go out. Try the email code instead.");
  }
  return sid;
}

/**
 * Texts a single-use 6-digit code to the mobile number on the person's record.
 * Rate limited on the same hourly cap as emailed codes.
 */
export async function sendSmsCode(userId: string, rawPhone: string | null | undefined, purpose: string) {
  const phone = normalizeSmsPhone(rawPhone);
  if (!phone) throw new Error("No mobile number we can text is on this account. Ask Operations to add one.");
  const result = await issueCode(userId, smsPurpose(purpose), phone, (code) =>
    sendSms(
      phone,
      `Harmonious: your confirmation code is ${code}. It expires in 10 minutes and works once. Not you? Contact operations@harmonious.co`,
    ),
  );
  await recordSecurityEvent({
    userId,
    eventType: "mfa_fallback_code_sent",
    action: `code texted to ${maskPhone(phone)} (${purpose})`,
  });
  return result;
}

/** Verifies a one-time code. A wrong or stale code never becomes usable. */
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

/** Verifies a texted code. Same single-use rules as an emailed one. */
export async function verifySmsCode(userId: string, code: string, purpose: string) {
  const { data: rows } = await db()
    .from("mfa_fallback_codes")
    .select("id, code_hash, attempts, expires_at")
    .eq("user_id", userId)
    .eq("purpose", smsPurpose(purpose))
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
  await recordSecurityEvent({ userId, eventType: "mfa_verified", action: "text fallback code accepted" });
  return { ok: true as const };
}
