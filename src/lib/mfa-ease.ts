/**
 * Second-step ease options, shared pure logic.
 *
 * Two app-owned ways to satisfy the *freshness* half of a step-up:
 *  - a remembered device (30 days) - after a successful authenticator check the
 *    device holds an opaque token whose hash the server keeps;
 *  - a single-use emailed code, for someone locked out of their authenticator
 *    app while a two-person reset is pending.
 *
 * Neither ever replaces the assurance level itself: the session must still be
 * aal2 from the hosted sign-in. The hosted sign-in gate (authenticator code or
 * recovery code) is unchanged.
 */
export const TRUSTED_DEVICE_DAYS = 30;
export const TRUSTED_DEVICE_MS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60_000;
export const FALLBACK_CODE_TTL_MS = 10 * 60_000;
export const FALLBACK_MAX_ATTEMPTS = 5;
export const FALLBACK_SENDS_PER_HOUR = 3;

export type StepUpProof = { trustedDeviceToken?: string; emailCode?: string; smsCode?: string };
export type StepUpMethod = "mfa_reverify" | "trusted_device" | "otp_email" | "otp_sms";
export type StepUpProofUsed = "fresh" | "trusted_device" | "email_code" | "sms_code" | null;

export interface TrustedDeviceRowLike {
  expires_at: string;
  revoked_at: string | null;
}

/** What the Security page shows for one remembered device. */
export interface TrustedDeviceView {
  id: string;
  device_id: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  revoked_at: string | null;
}

export function trustedDeviceExpiry(now = new Date()): string {
  return new Date(now.getTime() + TRUSTED_DEVICE_MS).toISOString();
}

export function isTrustedRowValid(row: TrustedDeviceRowLike | null | undefined, now = new Date()): boolean {
  if (!row) return false;
  if (row.revoked_at) return false;
  return new Date(row.expires_at).getTime() > now.getTime();
}

/**
 * Which proof satisfies the fresh second factor. `fresh` wins; then device; then
 * emailed code; then texted code - email is listed first because it costs nothing
 * and needs no carrier routing.
 */
export function pickStepUpMethod(input: {
  freshSecondFactor: boolean;
  trustedDeviceOk: boolean;
  emailCodeOk: boolean;
  smsCodeOk?: boolean;
}): { method: StepUpMethod; proofUsed: StepUpProofUsed } {
  if (input.freshSecondFactor) return { method: "mfa_reverify", proofUsed: "fresh" };
  if (input.trustedDeviceOk) return { method: "trusted_device", proofUsed: "trusted_device" };
  if (input.emailCodeOk) return { method: "otp_email", proofUsed: "email_code" };
  if (input.smsCodeOk) return { method: "otp_sms", proofUsed: "sms_code" };
  return { method: "mfa_reverify", proofUsed: null };
}

export function countRecentFallbackSends(createdAts: string[], now = Date.now()): number {
  const hourAgo = now - 60 * 60_000;
  return createdAts.filter((c) => new Date(c).getTime() >= hourAgo).length;
}

/** alyssa@harmonious.co -> a***ssa@harmonious.co (shown in confirmations). */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "your email";
  const name = email.slice(0, at);
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}***${name.slice(-2)}@${email.slice(at + 1)}`;
}

// ------------------------------------------------------------ texted codes

/**
 * A texted code is the same single-use 6-digit proof as an emailed one, delivered
 * to the mobile number on the person's record. It is stored in mfa_fallback_codes
 * with a ":sms" purpose marker, so a texted code can never satisfy a request that
 * expects an emailed one, and the hourly cap stays shared across both channels.
 */
export function smsPurpose(purpose: string): string {
  return `${purpose}:sms`;
}

/**
 * A stored phone value ("303-555-0142", "+1 303 555 0142") -> E.164 for Twilio.
 * Bare ten-digit numbers are read as US. Anything whose country can't be worked
 * out returns null rather than guessing.
 */
export function normalizeSmsPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (text.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** +13035550142 -> "+1 •••0142" - shown in confirmations, never the whole number. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 5) return "your phone";
  const last4 = digits.slice(-4);
  const country = digits.slice(0, digits.length - 10);
  return country ? `+${country} •••${last4}` : `•••${last4}`;
}

/** Where the app may text from: a Twilio number, a messaging service, or nothing yet. */
export type SmsSender = { from: string } | { messagingServiceSid: string };

export function pickSmsSender(env: {
  TWILIO_FROM_NUMBER?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
}): SmsSender | null {
  const from = normalizeSmsPhone(env.TWILIO_FROM_NUMBER);
  if (from) return { from };
  const sid = (env.TWILIO_MESSAGING_SERVICE_SID ?? "").trim();
  if (/^MG[0-9a-f]{32}$/i.test(sid)) return { messagingServiceSid: sid };
  return null;
}
