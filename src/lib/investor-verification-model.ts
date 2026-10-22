/** Pure, display-only verification summary. Never carries raw screening details. */
export type CheckState = "approved" | "needs_review" | "declined" | "pending";

export function checkState(status: string | null | undefined): CheckState {
  const s = String(status ?? "").toLowerCase();
  if (["approved", "clear", "passed", "verified"].includes(s)) return "approved";
  if (["declined", "rejected", "failed", "match", "hit"].includes(s)) return "declined";
  if (["review", "needs_review", "in_review", "manual_review", "flagged", "submitted"].includes(s)) return "needs_review";
  return "pending";
}

export const STATE_LABEL: Record<"kyc" | "aml", Record<CheckState, string>> = {
  kyc: { approved: "Approved", needs_review: "Needs review", declined: "Declined", pending: "Pending" },
  aml: { approved: "Clear", needs_review: "Needs review", declined: "Match", pending: "Pending" },
};

/** Count possible matches without exposing them. */
export function matchCount(matches: unknown): number {
  if (Array.isArray(matches)) return matches.length;
  const m = matches as any;
  if (m && Array.isArray(m.hits)) return m.hits.length;
  if (m && Array.isArray(m.matches)) return m.matches.length;
  return 0;
}

export function canDecide(state: CheckState) {
  return state === "needs_review" || state === "pending";
}

/** A flagged or declined result needs a written reason even to approve. */
export function noteRequired(decision: "approved" | "declined" | "info_requested", state: CheckState, matches: number) {
  if (decision !== "approved") return true;
  return state === "declined" || matches > 0;
}

export function reviewReason(kind: "kyc" | "aml", state: CheckState, matches: number): string | null {
  if (state !== "needs_review" && state !== "declined") return null;
  if (kind === "aml") return matches ? `${matches} possible match${matches === 1 ? "" : "es"}` : "Screening flagged for review";
  return state === "declined" ? "Identity check did not pass" : "Identity details need a person to confirm";
}
