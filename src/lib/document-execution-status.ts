/**
 * Canonical Investment Document Execution Status (Phase 3.8). One rule set that
 * every signature consumer uses; the older per-module `executionState` helpers
 * are thin adapters over this.
 *
 * Rules:
 *  - Only applicable documents count; Reference Only never blocks, Acknowledgment
 *    follows its acknowledgment, Signature Required needs the configured signers.
 *  - A PDF, a Box file, or the investor finishing their part is never Fully
 *    Executed. When a Fund countersignature is configured it must be complete.
 *  - Provider (Box) completion is authoritative for provider events, but if it
 *    disagrees with recorded required signers the result is Needs Review.
 */

export type DocumentUsageKind = "reference" | "acknowledgment" | "signature";

export type CanonicalExecutionStatus =
  | "not_required"
  | "not_started"
  | "ready_to_sign"
  | "sent"
  | "partially_signed"
  | "awaiting_countersignature"
  | "fully_executed"
  | "needs_review"
  | "declined"
  | "expired"
  | "cancelled";

export const CANONICAL_EXECUTION_LABELS: Record<CanonicalExecutionStatus, string> = {
  not_required: "Not Required",
  not_started: "Not Started",
  ready_to_sign: "Ready to Sign",
  sent: "Sent / Signing Started",
  partially_signed: "Partially Signed",
  awaiting_countersignature: "Investor Signed — Countersignature Required",
  fully_executed: "Fully Executed",
  needs_review: "Needs Review",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** Signer roles that represent the Fund's countersignature. */
export const COUNTERSIGN_ROLES = new Set(["fund_signatory", "fund_manager", "fund_countersigner", "countersigner"]);

export type ExecutionSigner = { role?: string | null; status: string; required?: boolean | null };

const isSigned = (s: string) => s === "signed" || s === "completed";

export function canonicalExecutionStatus(input: {
  usage?: DocumentUsageKind | null;
  acknowledged?: boolean;
  signers: readonly ExecutionSigner[];
  /** Box/provider reported the whole request complete. */
  providerCompleted?: boolean;
  /** A provider request exists / was sent. */
  providerSent?: boolean;
  /** The document can be signed now (setup ready, earlier steps done). */
  readyToSign?: boolean;
}): CanonicalExecutionStatus {
  const usage = input.usage ?? "signature";
  if (usage === "reference") return "not_required";
  if (usage === "acknowledgment") return input.acknowledged ? "fully_executed" : input.readyToSign ? "ready_to_sign" : "not_started";

  const req = input.signers.filter((s) => s.required !== false);
  if (!req.length) {
    // Legacy provider-only records: Box completion with no signer rows.
    if (input.providerCompleted) return "fully_executed";
    if (input.providerSent) return "sent";
    return input.readyToSign ? "ready_to_sign" : "not_started";
  }
  const st = req.map((s) => String(s.status));
  if (st.includes("error")) return "needs_review";
  if (st.includes("declined")) return "declined";
  if (st.includes("cancelled")) return "cancelled";
  if (st.includes("expired")) return "expired";
  if (st.every(isSigned)) return "fully_executed";
  // Provider says complete but a configured signer has not signed: never guess.
  if (input.providerCompleted) return "needs_review";
  const counter = req.filter((s) => COUNTERSIGN_ROLES.has(String(s.role ?? "")));
  const investorSide = req.filter((s) => !COUNTERSIGN_ROLES.has(String(s.role ?? "")));
  if (counter.length && investorSide.length && investorSide.every((s) => isSigned(String(s.status)))) return "awaiting_countersignature";
  if (st.some(isSigned)) return "partially_signed";
  if (st.every((s) => s === "pending")) return input.providerSent ? "sent" : input.readyToSign ? "ready_to_sign" : "not_started";
  return "sent";
}

export function isFullyExecuted(s: CanonicalExecutionStatus) { return s === "fully_executed"; }
