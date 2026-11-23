/** Pure rules for sign-without-sign-in links. The token itself is never stored, only its hash. */
export const LINK_DAYS = 14;

export type LinkRow = { expires_at: string; revoked_at: string | null; used_at: string | null };
export type LinkState = "active" | "expired" | "revoked" | "used";

export function linkState(row: LinkRow, now: Date = new Date()): LinkState {
  if (row.revoked_at) return "revoked";
  if (row.used_at) return "used";
  if (Date.parse(row.expires_at) <= now.getTime()) return "expired";
  return "active";
}

export function linkExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + LINK_DAYS * 86_400_000).toISOString();
}

export const LINK_STATE_MESSAGE: Record<Exclude<LinkState, "active">, string> = {
  expired: "This signing link has expired. Ask the fund manager or Harmonious for a new one.",
  revoked: "This signing link was replaced or cancelled. Please use the newest email you received.",
  used: "This document has already been signed. Thank you.",
};

export function isTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
