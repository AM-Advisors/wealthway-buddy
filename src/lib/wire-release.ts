/**
 * The single rule for "can investors see this fund's wire instructions?".
 * Facts come from the database's offering_wire_release_state; every screen,
 * email and to-do reads this rather than re-deriving it.
 */
export type WireReleaseState = {
  latestVersion: number | null;
  verified: boolean;
  bankingStatus: string | null;
  released: boolean;
  releasedVersion: number | null;
  available: boolean;
};

export const EMPTY_WIRE_RELEASE: WireReleaseState = {
  latestVersion: null, verified: false, bankingStatus: null, released: false, releasedVersion: null, available: false,
};

export function parseWireReleaseState(raw: unknown): WireReleaseState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const s: WireReleaseState = {
    latestVersion: num(r["latestVersion"]),
    verified: r["verified"] === true,
    bankingStatus: typeof r["bankingStatus"] === "string" ? (r["bankingStatus"] as string) : null,
    released: r["released"] === true,
    releasedVersion: num(r["releasedVersion"]),
    available: false,
  };
  s.available = wireInstructionsAvailable(s);
  return s;
}

/** Verified, account active, released, and released for exactly the current version. */
export function wireInstructionsAvailable(s: Omit<WireReleaseState, "available">): boolean {
  return s.verified && s.bankingStatus === "account_active" && s.released
    && s.latestVersion != null && s.releasedVersion === s.latestVersion;
}

/** What is still missing, in plain words, or null when available. */
export function wireReleaseBlocker(s: WireReleaseState): string | null {
  if (s.available) return null;
  if (s.latestVersion == null) return "The fund's bank details haven't been entered yet.";
  if (!s.verified) return "Harmonious is verifying the fund's bank details.";
  if (s.bankingStatus !== "account_active") return "The fund's bank account isn't marked active yet.";
  if (!s.released || s.releasedVersion !== s.latestVersion) return "Harmonious hasn't released the current bank details to investors yet.";
  return "Funding instructions aren't available yet.";
}

export type WireReleaseLabel = "Not entered" | "Awaiting verification" | "Verified, not released" | "Released to investors";
export function wireReleaseLabel(s: WireReleaseState): WireReleaseLabel {
  if (s.available) return "Released to investors";
  if (s.latestVersion == null) return "Not entered";
  if (!s.verified) return "Awaiting verification";
  return "Verified, not released";
}
