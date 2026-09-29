/**
 * Canonical Funding Status (Phase 3.8). The single place that decides whether an
 * investment is Funded and which funding state it is in. Screens, dashboards and
 * readiness consume this; none re-implement the rule.
 *
 * Compatibility map (read-only findings, no values changed):
 *  - investor_onboardings.funding_status (text) — canonical Investment record.
 *    "funded" is written only by the bank match → reconciliation → posting chain.
 *  - investor_applications.funding_status (payment_status enum: not_started,
 *    awaiting_wire, processing, settled, failed, returned, cancelled) — legacy
 *    application record. "settled" is written only after a staff-recorded
 *    settlement or a reconciled bank match, so it historically represents
 *    reconciled money and is treated as a synonym of "funded" here.
 *  The enum cannot hold "funded" and no writer puts "settled" on onboardings, so
 *  accepting both inside this one service does not change any existing answer.
 *
 * Investor says wire sent ≠ Funded. Intended, subscription or reported amounts
 * are never reconciled funded capital.
 */

export const RECONCILED_FUNDING_VALUES = ["funded", "settled"] as const;

const PENDING_RECONCILIATION = new Set([
  "bank_transaction_detected", "reconciliation_pending", "pending_reconciliation", "partially_funded",
  "received", "matched", "processing",
]);
const NEEDS_REVIEW = new Set(["funding_exception", "exception", "returned", "overfunded", "failed"]);
const REPORTED = new Set(["investor_reports_sent"]);
const INSTRUCTIONS = new Set(["awaiting_wire", "instructions_released"]);

export type CanonicalFundingState =
  | "not_ready"
  | "ready_for_funding"
  | "instructions_released"
  | "investor_reports_sent"
  | "pending_reconciliation"
  | "funded"
  | "needs_review";

export const CANONICAL_FUNDING_LABELS: Record<CanonicalFundingState, string> = {
  not_ready: "Not Ready",
  ready_for_funding: "Ready for Funding",
  instructions_released: "Instructions Released",
  investor_reports_sent: "Investor Reports Sent",
  pending_reconciliation: "Pending Reconciliation",
  funded: "Funded",
  needs_review: "Needs Review",
};

/** True only for reconciled money. The one Funded rule. */
export function isReconciledFunding(status: string | null | undefined): boolean {
  return (RECONCILED_FUNDING_VALUES as readonly string[]).includes(String(status ?? ""));
}

export function isPendingReconciliation(status: string | null | undefined): boolean {
  return PENDING_RECONCILIATION.has(String(status ?? ""));
}

export function isFundingException(status: string | null | undefined): boolean {
  return NEEDS_REVIEW.has(String(status ?? ""));
}

export type FundingFacts = {
  fundingStatus: string | null | undefined;
  approvedToFund?: boolean | null | undefined;
  instructionsReleased?: boolean | null | undefined;
  investorReportsSent?: boolean | null | undefined;
};

export function canonicalFundingState(f: FundingFacts): CanonicalFundingState {
  const s = String(f.fundingStatus ?? "");
  if (isReconciledFunding(s)) return "funded";
  if (NEEDS_REVIEW.has(s)) return "needs_review";
  if (PENDING_RECONCILIATION.has(s)) return "pending_reconciliation";
  if (REPORTED.has(s) || f.investorReportsSent) return "investor_reports_sent";
  if (!f.approvedToFund) return "not_ready";
  if (f.instructionsReleased || INSTRUCTIONS.has(s)) return "instructions_released";
  return "ready_for_funding";
}

/** Reconciled funded capital only — never intended/subscription/reported amounts. */
export function reconciledFundedCents<T>(rows: readonly T[], status: (r: T) => string | null | undefined, amount: (r: T) => number | null | undefined): number {
  return rows.reduce((n, r) => (isReconciledFunding(status(r)) ? n + Number(amount(r) ?? 0) : n), 0);
}
