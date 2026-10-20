/**
 * Pure rules for connecting accounts, invitations and investor records.
 * Email (verified) connects automatically; a tax ID alone only recognizes the
 * same investor and never grants an account access to another's records.
 */
export type TinMatchDecision = { kind: "none" } | { kind: "same_account" } | { kind: "link_profile"; profileId: string } | { kind: "review"; profileIds: string[] };

export function decideTinMatch(input: {
  /** Profiles elsewhere with the same tax ID fingerprint (excluding this one). */
  matches: { profileId: string; ownerUserId: string | null; ownerVerifiedEmail: string | null }[];
  /** Account that owns (or will own) the profile being saved, if any. */
  accountUserId: string | null;
  accountVerifiedEmail: string | null;
}): TinMatchDecision {
  const m = input.matches;
  if (!m.length) return { kind: "none" };
  if (input.accountUserId && m.every((x) => x.ownerUserId === input.accountUserId)) return { kind: "same_account" };
  const email = (input.accountVerifiedEmail ?? "").trim().toLowerCase();
  const sameEmail = email ? m.filter((x) => (x.ownerVerifiedEmail ?? "").trim().toLowerCase() === email) : [];
  if (m.length === 1 && sameEmail.length === 1) return { kind: "link_profile", profileId: sameEmail[0]!.profileId };
  return { kind: "review", profileIds: m.map((x) => x.profileId) };
}

/** An invitation or record may only connect to an account whose email is verified and matches. */
export function emailConnects(recordEmail: string | null | undefined, account: { email: string | null; verified: boolean }): boolean {
  const a = (recordEmail ?? "").trim().toLowerCase();
  const b = (account.email ?? "").trim().toLowerCase();
  return Boolean(account.verified && a && b && a === b);
}
