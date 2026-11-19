/**
 * Power of attorney records (pure). A record keeps the document and who it names on file.
 * It never grants signing, money, identity or access authority by itself.
 */
export const POA_POWERS = ["sign_documents", "investment_decisions", "provide_information", "tax_matters", "banking_matters", "other"] as const;
export type PoaPower = (typeof POA_POWERS)[number];
export const POA_POWER_LABELS: Record<PoaPower, string> = {
  sign_documents: "Sign documents",
  investment_decisions: "Make investment decisions",
  provide_information: "Provide information and answer questions",
  tax_matters: "Tax matters",
  banking_matters: "Banking matters",
  other: "Other (described below)",
};
export type PoaKind = "general" | "limited";
export const POA_KIND_LABELS: Record<PoaKind, string> = { general: "General", limited: "Limited (specific powers only)" };
export type PoaStatus = "pending_review" | "accepted" | "rejected" | "revoked";
export type PoaDisplayStatus = PoaStatus | "expired" | "not_yet_effective";
export const POA_STATUS_LABELS: Record<PoaDisplayStatus, string> = {
  pending_review: "Waiting for Harmonious review",
  accepted: "Accepted and in effect",
  rejected: "Not accepted",
  revoked: "Revoked",
  expired: "Expired",
  not_yet_effective: "Accepted, starts later",
};
/** Harmonious roles that may accept or reject a power of attorney. */
export const POA_REVIEWER_ROLES = ["super_admin", "admin", "operations", "compliance", "legal"] as const;

/** Status a person sees: accepted records also show when they have not started or have ended. */
export function poaDisplayStatus(r: { status: PoaStatus; effective_on: string; expires_on: string | null }, today: string): PoaDisplayStatus {
  if (r.status !== "accepted") return r.status;
  if (r.expires_on && r.expires_on < today) return "expired";
  if (r.effective_on > today) return "not_yet_effective";
  return "accepted";
}

/** Accepting or rejecting needs a Harmonious reviewer who did not upload it. */
export function poaReviewBlocker(reviewer: { userId: string; roles: string[] }, record: { submitted_by: string; status: PoaStatus }): string | null {
  if (!reviewer.roles.some((r) => (POA_REVIEWER_ROLES as readonly string[]).includes(r))) return "Only Harmonious Operations, Compliance, Legal or Admin can review a power of attorney.";
  if (reviewer.userId === record.submitted_by) return "Someone other than the person who uploaded it must review it.";
  if (record.status !== "pending_review") return "This power of attorney has already been reviewed.";
  return null;
}

export type PoaInput = { agentName: string; agentEmail?: string | null | undefined; poaKind: PoaKind; coveredPowers: string[]; limitsNote?: string | null | undefined; effectiveOn: string; expiresOn?: string | null | undefined };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function poaInputBlocker(i: PoaInput): string | null {
  if (!i.agentName.trim()) return "Enter the name of the person the power of attorney names.";
  if (i.agentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.agentEmail.trim())) return "Enter a valid email for that person, or leave it blank.";
  if (!DATE.test(i.effectiveOn)) return "Enter the date it takes effect.";
  if (i.expiresOn && !DATE.test(i.expiresOn)) return "Enter a valid end date, or leave it blank.";
  if (i.expiresOn && i.expiresOn < i.effectiveOn) return "The end date must be on or after the start date.";
  if (!i.coveredPowers.length) return "Choose at least one thing the document covers.";
  if (i.coveredPowers.some((p) => !(POA_POWERS as readonly string[]).includes(p))) return "Choose from the listed powers.";
  if (i.poaKind === "limited" && !i.limitsNote?.trim()) return "Describe the limits for a limited power of attorney.";
  if (i.coveredPowers.includes("other") && !i.limitsNote?.trim()) return "Describe the other powers.";
  return null;
}
