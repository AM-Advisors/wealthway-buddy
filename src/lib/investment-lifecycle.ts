/**
 * One answer to "where is this investment in signing, and whose turn is it?"
 * Pure and display-only: every manager/ops list reads its wording from here so
 * two cards on one page can never disagree. Grants no authority.
 */
export type SigningPhase = "investor_to_sign" | "awaiting_approval" | "awaiting_countersign" | "fully_signed";
export type Turn = "investor" | "fund_manager" | "none";

export const SIGNING_PHASE_LABEL: Record<SigningPhase, string> = {
  investor_to_sign: "Waiting on investor signature",
  awaiting_approval: "Investor signed: awaiting your approval",
  awaiting_countersign: "Investor signed: awaiting fund countersignature",
  fully_signed: "Fully signed",
};

export function signingPhase(f: { investorSigned: boolean; approved?: boolean; fundSignaturePending?: boolean; fullyExecuted?: boolean }): SigningPhase {
  if (f.fullyExecuted) return "fully_signed";
  if (!f.investorSigned) return "investor_to_sign";
  if (f.fundSignaturePending || f.approved) return "awaiting_countersign";
  return "awaiting_approval";
}

export function signingTurn(p: SigningPhase): Turn {
  return p === "investor_to_sign" ? "investor" : p === "fully_signed" ? "none" : "fund_manager";
}

/**
 * Operations wording for an onboarding at the signing or fund-review stage,
 * using the same signed fact as the fund manager's lists (an executed
 * snapshot means the investor signed). Null for other stages.
 */
export function onboardingSigningLabel(stage: string | null | undefined, investorSigned: boolean): string | null {
  const s = String(stage ?? "");
  if (s === "harmonious_review") return SIGNING_PHASE_LABEL.awaiting_countersign;
  if (s !== "signature") return null;
  return SIGNING_PHASE_LABEL[investorSigned ? "awaiting_countersign" : "investor_to_sign"];
}

/**
 * One set of words for a wire's status, shared by the investor, fund manager
 * and Operations wire screens. Display-only; never decides whether money is
 * reconciled (see isReconciledFunding).
 */
export const WIRE_STATUS_LABEL: Record<string, string> = {
  not_started: "No wire yet",
  awaiting_wire: "Waiting on investor wire",
  submitted: "Wire confirmation to review",
  processing: "Wire in transit",
  received: "Funds received",
  settled: "Funds received",
  funded: "Funds received",
  problem: "Wire needs attention",
  failed: "Wire failed",
  returned: "Wire returned",
  cancelled: "Wire cancelled",
};
