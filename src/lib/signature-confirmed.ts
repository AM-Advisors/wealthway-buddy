/**
 * A paper counts as signed only when signing actually finished: the signing service confirmed it,
 * or it was signed directly on the platform. Papers sent to the signing service also carry a time
 * in signed_at (the send time), so signed_at alone never means signed.
 * Rows passed in must include provider, provider_status, provider_completed_at and signed_at.
 */
export type ConfirmableSignature = { provider?: string | null; provider_status?: string | null; provider_completed_at?: string | null; signed_at?: string | null; cancelled_at?: string | null };

const PLATFORM = new Set(["internal", "native"]);

export function signatureConfirmed(s: ConfirmableSignature | null | undefined): boolean {
  if (!s || s.cancelled_at) return false;
  if (s.provider_status === "completed" || s.provider_completed_at) return true;
  return (!s.provider || PLATFORM.has(s.provider)) && Boolean(s.signed_at);
}

/** When signing finished, or null when it hasn't. */
export function confirmedSignedAt(s: ConfirmableSignature | null | undefined): string | null {
  if (!signatureConfirmed(s)) return null;
  return s!.provider_completed_at ?? s!.signed_at ?? null;
}

export const CONFIRM_COLUMNS = "provider, provider_status, provider_completed_at, signed_at";
