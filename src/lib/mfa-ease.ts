/**
 * Second-step ease options, shared pure logic.
 *
 * Two app-owned ways to satisfy the *freshness* half of a step-up:
 *  - a remembered device (30 days) - after a successful authenticator check the
 *    device holds an opaque token whose hash the server keeps;
 *  - a single-use emailed code - for someone locked out of their authenticator
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

export type StepUpProof = { trustedDeviceToken?: string; emailCode?: string };
export type StepUpMethod = "mfa_reverify" | "trusted_device" | "otp_email";
export type StepUpProofUsed = "fresh" | "trusted_device" | "email_code" | null;

export interface TrustedDeviceRowLike {
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

/** Which proof satisfies the fresh second factor. `fresh` wins; then device; then emailed code. */
export function pickStepUpMethod(input: {
  freshSecondFactor: boolean;
  trustedDeviceOk: boolean;
  emailCodeOk: boolean;
}): { method: StepUpMethod; proofUsed: StepUpProofUsed } {
  if (input.freshSecondFactor) return { method: "mfa_reverify", proofUsed: "fresh" };
  if (input.trustedDeviceOk) return { method: "trusted_device", proofUsed: "trusted_device" };
  if (input.emailCodeOk) return { method: "otp_email", proofUsed: "email_code" };
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
