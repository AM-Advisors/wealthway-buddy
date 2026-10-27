/**
 * One shared reader for identity (KYC) and screening (AML) status.
 * Pure and display-only: it never writes, approves or widens access.
 *
 * The verified person record is the source of truth. The older per-fund
 * application copy is only a fallback when the person record is unreadable
 * or has no result yet.
 */
export type CanonicalStatus = "approved" | "review" | "declined" | "pending";

const APPROVED = ["approved", "clear", "passed", "verified", "complete", "completed"];
const DECLINED = ["declined", "rejected", "failed", "match", "hit"];
const REVIEW = ["review", "needs_review", "in_review", "manual_review", "flagged", "submitted", "info_requested"];

export function canonicalVerificationStatus(status: string | null | undefined): CanonicalStatus {
  const s = String(status ?? "").trim().toLowerCase();
  if (APPROVED.includes(s)) return "approved";
  if (DECLINED.includes(s)) return "declined";
  if (REVIEW.includes(s)) return "review";
  return "pending";
}

/** Person record wins whenever it holds a real result; otherwise use the application copy. */
export function effectiveCheckStatus(
  personStatus: string | null | undefined,
  applicationStatus: string | null | undefined,
): CanonicalStatus {
  const person = canonicalVerificationStatus(personStatus);
  if (person !== "pending") return person;
  return canonicalVerificationStatus(applicationStatus);
}

export function identityCleared(kyc: CanonicalStatus, aml: CanonicalStatus) {
  return kyc === "approved" && aml === "approved";
}

/** Same words on every screen. Managers never see screening match detail. */
export const VERIFICATION_LABEL: Record<CanonicalStatus, string> = {
  approved: "Verified",
  review: "Under review",
  declined: "Not passed",
  pending: "Not started",
};

type PersonRow = { user_id: string | null; kyc_status: string | null; aml_status: string | null; merged_into_person_id?: string | null };

/** Index person results by login account, ignoring merged-away duplicates. */
export function personStatusByUser(rows: PersonRow[] | null | undefined) {
  const map = new Map<string, { kyc: string | null; aml: string | null }>();
  for (const row of rows ?? []) {
    if (!row.user_id || row.merged_into_person_id) continue;
    const prev = map.get(row.user_id);
    // If several persons share a login, keep the strongest verified result.
    if (prev && canonicalVerificationStatus(prev.kyc) === "approved") continue;
    map.set(row.user_id, { kyc: row.kyc_status, aml: row.aml_status });
  }
  return map;
}

/** Return the application with kyc/aml replaced by the canonical status. */
export function withCanonicalVerification<T extends { user_id: string; kyc_status?: string | null; aml_status?: string | null }>(
  app: T,
  persons: Map<string, { kyc: string | null; aml: string | null }>,
): T & { kyc_status: CanonicalStatus; aml_status: CanonicalStatus } {
  const p = persons.get(app.user_id);
  return {
    ...app,
    kyc_status: effectiveCheckStatus(p?.kyc, app.kyc_status),
    aml_status: effectiveCheckStatus(p?.aml, app.aml_status),
  };
}
