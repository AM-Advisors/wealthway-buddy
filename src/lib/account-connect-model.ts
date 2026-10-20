/**
 * Pure rules for connecting accounts, invitations and investor records.
 * Email (verified) connects automatically; a tax ID alone only recognizes the
 * same investor and never grants an account access to another's records.
 */
export type TinMatchDecision =
  | { kind: "none" }
  | { kind: "same_account" }
  | { kind: "link_profile"; profileId: string }
  | { kind: "merge"; profileId: string }
  | { kind: "review"; profileIds: string[] };

/** Normalize a legal name for comparison: case, punctuation, spacing and common suffix forms. */
export function normalizeLegalName(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function decideTinMatch(input: {
  /** Profiles elsewhere with the same tax ID fingerprint (excluding this one). */
  matches: { profileId: string; ownerUserId: string | null; ownerVerifiedEmail: string | null; legalName?: string | null; verified?: boolean }[];
  /** Account that owns (or will own) the profile being saved, if any. */
  accountUserId: string | null;
  accountVerifiedEmail: string | null;
  /** Legal name and KYC/KYB+AML result of the profile being saved. */
  selfLegalName?: string | null;
  selfVerified?: boolean;
}): TinMatchDecision {
  const m = input.matches;
  if (!m.length) return { kind: "none" };
  if (input.accountUserId && m.every((x) => x.ownerUserId === input.accountUserId)) return { kind: "same_account" };
  const email = (input.accountVerifiedEmail ?? "").trim().toLowerCase();
  const sameEmail = email ? m.filter((x) => (x.ownerVerifiedEmail ?? "").trim().toLowerCase() === email) : [];
  if (m.length === 1 && sameEmail.length === 1) return { kind: "link_profile", profileId: sameEmail[0]!.profileId };
  // Same tax ID + same legal name + verification passed on both → connect automatically,
  // unless that would combine two different sign-in accounts.
  const name = normalizeLegalName(input.selfLegalName);
  if (m.length === 1 && name && input.selfVerified) {
    const o = m[0]!;
    const twoAccounts = Boolean(input.accountUserId && o.ownerUserId && input.accountUserId !== o.ownerUserId);
    if (o.verified && normalizeLegalName(o.legalName) === name && !twoAccounts) return { kind: "merge", profileId: o.profileId };
  }
  return { kind: "review", profileIds: m.map((x) => x.profileId) };
}

/** An invitation or record may only connect to an account whose email is verified and matches. */
export function emailConnects(recordEmail: string | null | undefined, account: { email: string | null; verified: boolean }): boolean {
  const a = (recordEmail ?? "").trim().toLowerCase();
  const b = (account.email ?? "").trim().toLowerCase();
  return Boolean(account.verified && a && b && a === b);
}
