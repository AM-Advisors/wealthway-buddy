/**
 * Side Letter Registry - pure model. Side letters are a versioned record only:
 * they never change fee calculations, capital accounts, distributions,
 * readiness or launch. MFN outcomes are explicit human decisions.
 */

export const TERM_CATEGORIES = [
  { key: "fee_discount", label: "Fee discount" },
  { key: "carry_reduction", label: "Carry reduction" },
  { key: "reporting_rights", label: "Reporting rights" },
  { key: "co_invest_rights", label: "Co-invest rights" },
  { key: "transfer_rights", label: "Transfer rights" },
  { key: "mfn", label: "MFN" },
  { key: "excuse_rights", label: "Excuse rights" },
  { key: "information_rights", label: "Information rights" },
  { key: "other", label: "Other" },
] as const;
export type TermCategory = (typeof TERM_CATEGORIES)[number]["key"];

export const MFN_SCOPES = [
  { key: "all_investors", label: "All investors" },
  { key: "same_class", label: "Same class only" },
  { key: "commitment_at_or_below", label: "Investors at or below their commitment" },
] as const;
export type MfnScope = (typeof MFN_SCOPES)[number]["key"];

export const MFN_DECISIONS = ["offered", "elected", "declined", "not_eligible"] as const;
export type MfnDecision = (typeof MFN_DECISIONS)[number];

export interface SideLetterTerm {
  id: string;
  category: TermCategory;
  description: string;
  value?: string | null;
  applicability?: string | null;
}

export interface SideLetterSnapshot {
  investorLabel: string;
  mfnEnabled: boolean;
  mfnScope: MfnScope | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  renewalNote: string | null;
  documentReference: string | null;
  terms: SideLetterTerm[];
}

export type ExpiryStatus = "active" | "expiring" | "expired" | "not_effective";
export const EXPIRING_WINDOW_DAYS = 60;

export function expiryStatus(
  s: { effectiveDate: string | null; expiryDate: string | null },
  today: Date = new Date(),
): ExpiryStatus {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (s.effectiveDate && Date.parse(s.effectiveDate) > t) return "not_effective";
  if (!s.expiryDate) return "active";
  const exp = Date.parse(s.expiryDate);
  if (exp < t) return "expired";
  if (exp - t <= EXPIRING_WINDOW_DAYS * 86_400_000) return "expiring";
  return "active";
}

export interface MfnHolder {
  sideLetterId: string;
  classKey: string | null;
  commitmentCents: number | null;
  mfnEnabled: boolean;
  mfnScope: MfnScope | null;
  active: boolean;
}

/** Holders who may be entitled to a term granted on `source`. Never applies anything. */
export function mfnCandidates(
  source: { sideLetterId: string; classKey: string | null; commitmentCents: number | null },
  holders: MfnHolder[],
): string[] {
  return holders
    .filter((h) => h.sideLetterId !== source.sideLetterId && h.active && h.mfnEnabled && h.mfnScope)
    .filter((h) => {
      if (h.mfnScope === "all_investors") return true;
      if (h.mfnScope === "same_class") return !!h.classKey && h.classKey === source.classKey;
      // Grantee's commitment must be at or below the holder's commitment.
      if (h.commitmentCents == null || source.commitmentCents == null) return false;
      return source.commitmentCents <= h.commitmentCents;
    })
    .map((h) => h.sideLetterId);
}

export type ActorKind = "staff" | "manager" | "assistant" | "viewer" | "none";

/**
 * Who may approve a pending change. Never the proposer. Staff can approve
 * anything; a manager can approve another manager's or staff's proposal on
 * the same Fund. A sole manager's own proposals therefore go to Harmonious.
 */
export function canApprove(input: {
  actorId: string;
  actorKind: ActorKind;
  proposedBy: string;
}): boolean {
  if (input.actorId === input.proposedBy) return false;
  return input.actorKind === "staff" || input.actorKind === "manager";
}

export function canPropose(kind: ActorKind): boolean {
  return kind === "staff" || kind === "manager" || kind === "assistant";
}

export function emptySnapshot(investorLabel = ""): SideLetterSnapshot {
  return {
    investorLabel,
    mfnEnabled: false,
    mfnScope: null,
    effectiveDate: null,
    expiryDate: null,
    renewalNote: null,
    documentReference: null,
    terms: [],
  };
}
