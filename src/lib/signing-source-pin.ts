/** Requests sent from this time carry guided (pre-placed) signature fields. */
export const GUIDED_SIGNING_SINCE = "2026-11-18T21:00:00Z";
/**
 * Subscription agreements sent before this time may have gone out as the blank
 * template (a replacement request read the old request's pinned version and
 * skipped the investor's amount, name and signature tags). Unsigned ones are
 * rebuilt once on the investor's next open.
 */
export const PREFILLED_SUBSCRIPTION_SINCE = "2026-11-23T20:40:00Z";

export interface SignaturePinFacts {
  provider_completed_at?: string | null;
  provider_sent_at?: string | null;
  cancelled_at?: string | null;
  provider_status?: string | null;
}

/**
 * Must the agreement be read from the exact version a request was locked to?
 * Finished requests always stay pinned. When a new request is being built the
 * open one is being replaced, so the current version is prepared and filled.
 */
export function signingSourcePinned(sig: SignaturePinFacts | null | undefined, opts: { newRequest?: boolean } = {}): boolean {
  if (!sig) return false;
  if (sig.provider_completed_at) return true;
  if (opts.newRequest) return false;
  return Boolean(sig.provider_sent_at && !sig.cancelled_at && sig.provider_status !== "cancelled");
}

/** May an open, unsigned request be handed back to the investor as is? */
export function openRequestReusable(input: { sentAt: string | null | undefined; documentCategory: string | null | undefined }): boolean {
  const sent = new Date(String(input.sentAt ?? 0)).getTime();
  if (!(sent >= Date.parse(GUIDED_SIGNING_SINCE))) return false;
  if (input.documentCategory === "subscription_agreement" && sent < Date.parse(PREFILLED_SUBSCRIPTION_SINCE)) return false;
  return true;
}
