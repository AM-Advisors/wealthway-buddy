/**
 * Fund Investor Onboarding Link - pure rules shared by server and tests.
 * The link is an entry point into the existing onboarding flow, never a
 * credential: it names one Fund/Offering and grants nothing on its own.
 */
export const TOKEN_BYTES = 32;
/** base64url of 32 bytes = 43 chars. Anything else is rejected before any lookup. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateLinkToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(TOKEN_BYTES);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const tokenLooksValid = (t: unknown): t is string => typeof t === "string" && TOKEN_PATTERN.test(t);

export type LinkRow = { id: string; offering_id: string; status: "active" | "disabled" | "superseded"; created_at: string; superseded_at?: string | null; disabled_at?: string | null; last_used_at?: string | null };

export type LinkStatus = "active" | "disabled" | "not_configured";
export function linkStatus(row: Pick<LinkRow, "status"> | null | undefined): LinkStatus {
  if (!row || row.status === "superseded") return "not_configured";
  return row.status;
}
export const LINK_STATUS_LABEL: Record<LinkStatus, string> = { active: "Active", disabled: "Disabled", not_configured: "Not configured" };

/** A link can start onboarding only when active and the offering is open for onboarding. */
export function linkCanStart(row: Pick<LinkRow, "status"> | null | undefined, offeringOpen: boolean) {
  return !!row && row.status === "active" && offeringOpen;
}

/**
 * The only fields ever returned before sign-in. Explicit whitelist: no
 * investors, documents, amounts, terms, bank details or internal IDs.
 */
export function publicLinkView(input: { fundName: string; managedBy: string | null; [k: string]: unknown }) {
  return { fundName: input.fundName, managedBy: input.managedBy ?? null };
}

export const invitationMessage = (fundName: string, url: string) =>
  `You've been invited to complete investor onboarding for ${fundName} through Harmonious.\n\nStart here: ${url}`;

/** Simple sliding-window limit on link lookups per caller. */
export const RATE_WINDOW_MINUTES = 10;
export const RATE_MAX_ATTEMPTS = 30;
export const RATE_MAX_FAILURES = 10;
export function rateLimited(recent: { ok: boolean }[]) {
  return recent.length >= RATE_MAX_ATTEMPTS || recent.filter((r) => !r.ok).length >= RATE_MAX_FAILURES;
}

export const LINK_UNAVAILABLE = "This onboarding link isn't active. Please ask the fund for a current link.";
