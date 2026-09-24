/**
 * Fund-specific onboarding: pure rules for dual signature sequencing, funding
 * projection and fresh-authentication wire reveal. No storage here — every
 * input comes from authoritative records evaluated on the server.
 */

export type SigningMode = "investor_only" | "dual";
export type SignerRole = "investor" | "fund_manager";

export const SIGNER_ROLE_LABELS: Record<SignerRole, string> = {
  investor: "Investor",
  fund_manager: "Fund Manager",
};

export const FIELD_TYPES = [
  { value: "signature", label: "Signature" },
  { value: "initials", label: "Initials" },
  { value: "full_name", label: "Printed name" },
  { value: "title", label: "Title" },
  { value: "entity_name", label: "Entity name" },
  { value: "date", label: "Date signed" },
  { value: "text", label: "Text" },
] as const;

export type SigningStage =
  | "prepared"
  | "sent_to_investor"
  | "investor_signed"
  | "awaiting_fund_manager"
  | "fully_executed"
  | "declined"
  | "cancelled"
  | "expired";

export const SIGNING_STAGE_LABELS: Record<SigningStage, string> = {
  prepared: "Prepared",
  sent_to_investor: "Sent to investor",
  investor_signed: "Investor signed",
  awaiting_fund_manager: "Awaiting Fund Manager",
  fully_executed: "Fully executed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

export type SignerSnapshot = { role: SignerRole; order: number; status: string };

/**
 * Derive the lifecycle from PROVIDER-reported state only. A document is
 * fully executed only when the provider request is complete AND every
 * required signer in the mode reports signed. Cancelled / replaced /
 * expired requests are never executed.
 */
export function signingStage(input: {
  mode: SigningMode;
  providerStatus: string | null | undefined;
  signers: SignerSnapshot[];
}): SigningStage {
  const p = String(input.providerStatus ?? "").toLowerCase();
  if (!p) return "prepared";
  if (p === "cancelled" || p === "replaced") return "cancelled";
  if (p === "declined") return "declined";
  if (p === "expired") return "expired";
  const signed = (r: SignerRole) => input.signers.some((s) => s.role === r && s.status === "signed");
  const investorSigned = signed("investor");
  const managerSigned = signed("fund_manager");
  if (input.signers.some((s) => s.status === "declined")) return "declined";
  const required: SignerRole[] = input.mode === "dual" ? ["investor", "fund_manager"] : ["investor"];
  if (p === "completed" && required.every(signed)) return "fully_executed";
  if (input.mode === "dual" && investorSigned && !managerSigned) return "awaiting_fund_manager";
  if (investorSigned && input.mode === "investor_only") return "investor_signed";
  return "sent_to_investor";
}

/** Investor-first: a manager may only countersign after the investor's provider-confirmed signature. */
export function canCountersign(input: {
  mode: SigningMode;
  stage: SigningStage;
  hasFundAuthority: boolean;
}): { allowed: boolean; reason?: string } {
  if (input.mode !== "dual") return { allowed: false, reason: "This document does not need a countersignature." };
  if (!input.hasFundAuthority) return { allowed: false, reason: "You are not an authorized signatory for this fund." };
  if (input.stage !== "awaiting_fund_manager") {
    return { allowed: false, reason: "The investor must sign first." };
  }
  return { allowed: true };
}

/** Before an investor receives a document, the preparation must be complete. */
export function signingConfigComplete(input: {
  mode: SigningMode;
  countersignerUserId: string | null;
  blocks: { signer_role: SignerRole; block_type: string }[];
}): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  const has = (r: SignerRole) => input.blocks.some((b) => b.signer_role === r && b.block_type === "signature");
  if (!has("investor")) missing.push("An investor signature field");
  if (input.mode === "dual") {
    if (!input.countersignerUserId) missing.push("An authorized fund signatory");
    if (!has("fund_manager")) missing.push("A fund manager signature field");
  }
  return { ready: missing.length === 0, missing };
}

// ---------------------------------------------------------------- funding

export const MANAGER_FUNDING_LABELS = [
  "Not ready",
  "Instructions available",
  "Investor says sent",
  "Payment detected",
  "Reconciliation required",
  "Funded",
] as const;
export type ManagerFundingLabel = (typeof MANAGER_FUNDING_LABELS)[number];

/**
 * Funded is only ever the authoritative funding_status written by the
 * bank match → reconciliation → posted accounting chain. Investor or manager
 * statements never produce it.
 */
export function managerFundingLabel(input: {
  approvedToFund: boolean;
  instructionsReleased: boolean;
  fundingStatus: string | null | undefined;
  investorReportsSent: boolean;
}): ManagerFundingLabel {
  const s = String(input.fundingStatus ?? "");
  if (s === "funded") return "Funded";
  if (s === "partially_funded" || s === "overfunded" || s === "exception") return "Reconciliation required";
  if (s === "received" || s === "matched" || s === "pending_reconciliation") return "Payment detected";
  if (!input.approvedToFund || !input.instructionsReleased) return "Not ready";
  if (input.investorReportsSent || s === "investor_reports_sent") return "Investor says sent";
  return "Instructions available";
}

export const WIRE_FRAUD_WARNING =
  "Harmonious will not change wire instructions by email. If you receive different instructions or a request to send funds somewhere else, do not send the wire and contact Harmonious using a verified phone number.";

// ------------------------------------------------------ fresh authentication

export const WIRE_REVEAL_MAX_AGE_SECONDS = 10 * 60;

/**
 * Supabase access tokens carry `amr` entries with the time each sign-in
 * method was completed. Token refreshes do not update them, so this is a
 * genuine "signed in recently" signal that cannot be supplied by the URL.
 */
export function freshAuthAge(claims: unknown, nowSeconds: number): number | null {
  const amr = (claims as any)?.amr;
  if (!Array.isArray(amr)) return null;
  const times = amr.map((a: any) => Number(a?.timestamp)).filter((t) => Number.isFinite(t) && t > 0);
  if (!times.length) return null;
  return nowSeconds - Math.max(...times);
}

export function isFreshAuth(claims: unknown, nowSeconds: number, maxAge = WIRE_REVEAL_MAX_AGE_SECONDS): boolean {
  const age = freshAuthAge(claims, nowSeconds);
  return age !== null && age >= -60 && age <= maxAge;
}

/** Five-step investor view: adds Fund and Complete on top of the three onboarding steps. */
export type FundStepState = "locked" | "not_ready" | "available" | "investor_sent" | "funded";

export function fundStepState(input: {
  onboardingComplete: boolean;
  fundingUnlocked: boolean;
  fundingStatus: string | null | undefined;
  investorReportsSent: boolean;
}): FundStepState {
  if (String(input.fundingStatus ?? "") === "funded") return "funded";
  if (!input.onboardingComplete) return "locked";
  if (!input.fundingUnlocked) return "not_ready";
  if (input.investorReportsSent) return "investor_sent";
  return "available";
}
