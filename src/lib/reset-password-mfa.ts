/**
 * Password reset for accounts with an authenticator app.
 * A reset link only proves the email (first step). When the account has a verified
 * second step, the sign-in service refuses a password change until that step is done,
 * so the reset page must ask for the 6-digit code (or a backup code) first.
 */
import { mfaStage } from "@/lib/mfa-stage";

export type ResetSecondStep = "needed" | "not_needed" | "unknown";

export function resetSecondStep(input: {
  currentLevel: string | null | undefined;
  verifiedFactorCount: number | null;
}): ResetSecondStep {
  const stage = mfaStage(input);
  if (stage === "error") return "unknown";
  return stage === "verify" ? "needed" : "not_needed";
}

/** True when the sign-in service refused the change because the second step wasn't done. */
export function isSecondStepRequiredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === "insufficient_aal") return true;
  return typeof e.message === "string" && /\baal2\b|assurance level/i.test(e.message);
}

/** A 6-digit authenticator code, ignoring spaces people paste in. */
export function cleanAuthenticatorCode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
