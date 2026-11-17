/**
 * Plain names for the Harmonious investor onboarding review queue.
 * Investors added before signing in have no login account, so the name comes
 * from the investing party and the person on the investment, never a guess.
 */

type PersonLike = { legal_first_name?: string | null; legal_last_name?: string | null; email?: string | null } | null | undefined;
type ProfileLike = { profile_type?: string | null; legal_name?: string | null; display_label?: string | null } | null | undefined;
type AccountLike = { legal_name?: string | null; email?: string | null } | null | undefined;

const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s.length ? s : null;
};

export type QueueInvestorLabel = {
  /** Investing party shown first: the entity for entities, the person for individuals. */
  investorName: string;
  /** The person on an entity investment, when different from the entity name. */
  contactName: string | null;
  investorEmail: string | null;
  isEntity: boolean;
};

export function queueInvestorLabel(input: { person?: PersonLike; profile?: ProfileLike; account?: AccountLike }): QueueInvestorLabel {
  const { person, profile, account } = input;
  const personName =
    clean(`${person?.legal_first_name ?? ""} ${person?.legal_last_name ?? ""}`) ?? clean(account?.legal_name);
  const partyName = clean(profile?.legal_name) ?? clean(profile?.display_label);
  const email = clean(person?.email) ?? clean(account?.email);
  const isEntity = Boolean(profile?.profile_type && profile.profile_type !== "individual");

  if (isEntity && partyName) {
    return {
      investorName: partyName,
      contactName: personName && personName.toLowerCase() !== partyName.toLowerCase() ? personName : null,
      investorEmail: email,
      isEntity,
    };
  }
  return { investorName: personName ?? partyName ?? email ?? "Investor", contactName: null, investorEmail: email, isEntity };
}

export type QueueSearchItem = {
  investorName?: string | null;
  contactName?: string | null;
  investorEmail?: string | null;
  offeringName?: string | null;
  bucket?: string | null;
  stage?: string | null;
};

/** Case-insensitive match on name, contact, email, fund and status; every word must match. */
export function matchesQueueSearch(item: QueueSearchItem, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [item.investorName, item.contactName, item.investorEmail, item.offeringName, item.bucket, item.stage]
    .filter(Boolean)
    .map((v) => String(v).replace(/_/g, " ").toLowerCase())
    .join(" | ");
  return words.every((w) => hay.includes(w));
}
