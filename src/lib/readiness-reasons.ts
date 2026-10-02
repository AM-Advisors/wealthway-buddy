/**
 * Canonical Next Action reasons (Phase 3.8). One deterministic reason code per
 * readiness condition, with its responsible audience, blocking flag,
 * destination and audience-specific wording. Not a workflow engine: reasons are
 * derived from the existing readiness result (src/lib/investment-readiness.ts).
 */
import type { ReadinessResult } from "@/lib/investment-readiness";

export type ReasonAudience = "investor" | "fund_manager" | "harmonious";
export type ReasonCode =
  | "INVESTOR_PROFILE_INCOMPLETE" | "IDENTITY_VERIFICATION_REQUIRED" | "ENTITY_REVIEW_REQUIRED"
  | "SCREENING_REVIEW_REQUIRED" | "ACCREDITATION_REQUIRED" | "TAX_FORM_REQUIRED" | "SIGNATURE_REQUIRED"
  | "FUND_COUNTERSIGNATURE_REQUIRED" | "APPROVAL_TO_FUND_REQUIRED" | "FUNDING_REQUIRED"
  | "FUNDING_RECONCILIATION_REQUIRED" | "FUNDING_EXCEPTION" | "BANKING_VERIFICATION_REQUIRED"
  | "LEGAL_NAME_REQUIRED" | "OPEN_ISSUE" | "ACCEPTANCE_REQUIRED" | "OTHER";

export type ReasonDef = {
  code: ReasonCode;
  record: string;
  blocking: boolean;
  destination: { investor?: string; fund_manager?: string; harmonious?: string };
  wording: Record<ReasonAudience, string>;
};

const R = (code: ReasonCode, record: string, wording: Record<ReasonAudience, string>, destination: ReasonDef["destination"] = {}, blocking = true): ReasonDef =>
  ({ code, record, blocking, destination, wording });

export const REASONS: Record<ReasonCode, ReasonDef> = {
  INVESTOR_PROFILE_INCOMPLETE: R("INVESTOR_PROFILE_INCOMPLETE", "investment_profiles", {
    investor: "Finish the About You details for this investment.", fund_manager: "Waiting for the investor to finish their details.", harmonious: "Investor profile incomplete." }, { investor: "/onboard" }),
  IDENTITY_VERIFICATION_REQUIRED: R("IDENTITY_VERIFICATION_REQUIRED", "identity_checks", {
    investor: "Complete identity verification.", fund_manager: "Identity verification in progress.", harmonious: "Identity verification required." }, { investor: "/onboard" }),
  ENTITY_REVIEW_REQUIRED: R("ENTITY_REVIEW_REQUIRED", "entity_verifications", {
    investor: "Harmonious is reviewing your entity details. No action is needed right now.", fund_manager: "Entity review with Harmonious.", harmonious: "Review entity verification." }, { harmonious: "/ops/readiness" }),
  SCREENING_REVIEW_REQUIRED: R("SCREENING_REVIEW_REQUIRED", "aml_screenings", {
    investor: "Harmonious is completing a standard review. No action is needed right now.", fund_manager: "Compliance review with Harmonious.", harmonious: "Review screening result." }, { harmonious: "/ops/readiness" }),
  ACCREDITATION_REQUIRED: R("ACCREDITATION_REQUIRED", "accreditation_records", {
    investor: "Confirm your accredited investor status.", fund_manager: "Waiting on accreditation.", harmonious: "Accreditation required." }, { investor: "/onboard" }),
  TAX_FORM_REQUIRED: R("TAX_FORM_REQUIRED", "tax_forms", {
    investor: "Complete your tax form.", fund_manager: "Waiting on the investor's tax form.", harmonious: "Tax form required." }, { investor: "/onboard" }),
  SIGNATURE_REQUIRED: R("SIGNATURE_REQUIRED", "document_signatures", {
    investor: "Review and sign your subscription documents.", fund_manager: "Waiting for the investor to sign.", harmonious: "Investor signature required." }, { investor: "/onboard" }),
  FUND_COUNTERSIGNATURE_REQUIRED: R("FUND_COUNTERSIGNATURE_REQUIRED", "document_signature_signers", {
    investor: "You've signed. The fund's countersignature is pending.", fund_manager: "Your countersignature is needed.", harmonious: "Fund countersignature outstanding." }, { fund_manager: "/manager" }),
  APPROVAL_TO_FUND_REQUIRED: R("APPROVAL_TO_FUND_REQUIRED", "investor_onboardings", {
    investor: "Harmonious is reviewing your subscription.", fund_manager: "Harmonious is reviewing the subscription.", harmonious: "Approve investor to fund." }, { harmonious: "/ops/readiness" }),
  FUNDING_REQUIRED: R("FUNDING_REQUIRED", "investor_onboardings", {
    investor: "Send your funds using the secure wiring instructions.", fund_manager: "Waiting for the investor's wire.", harmonious: "Awaiting investor funds." }, { investor: "/onboard" }),
  FUNDING_RECONCILIATION_REQUIRED: R("FUNDING_RECONCILIATION_REQUIRED", "bank_transactions", {
    investor: "Thanks - we'll confirm once your transfer is received and matched.", fund_manager: "Wire reported; Harmonious is reconciling.", harmonious: "Reconcile incoming wire." }, { harmonious: "/ops/readiness" }),
  FUNDING_EXCEPTION: R("FUNDING_EXCEPTION", "bank_transactions", {
    investor: "Harmonious is reviewing your transfer and will contact you if anything is needed.", fund_manager: "Funding issue with Harmonious.", harmonious: "Resolve funding exception." }, { harmonious: "/ops/readiness" }),
  BANKING_VERIFICATION_REQUIRED: R("BANKING_VERIFICATION_REQUIRED", "funding_instruction_versions", {
    investor: "Funding instructions will be available after Harmonious completes verification.", fund_manager: "Banking is awaiting Harmonious verification.", harmonious: "Verify banking instructions." }, { harmonious: "/ops" }),
  LEGAL_NAME_REQUIRED: R("LEGAL_NAME_REQUIRED", "offerings", {
    investor: "The fund is completing its setup. No action is needed right now.", fund_manager: "Harmonious is recording the fund's Legal Name.", harmonious: "Legal Name is required before this Fund can complete this step." }, { harmonious: "/ops" }),
  OPEN_ISSUE: R("OPEN_ISSUE", "application_flags", {
    investor: "Harmonious is looking into an item on your investment and will contact you if needed.", fund_manager: "An open item is with Harmonious.", harmonious: "Resolve open review issue." }, { harmonious: "/ops/readiness" }),
  ACCEPTANCE_REQUIRED: R("ACCEPTANCE_REQUIRED", "investor_onboardings", {
    investor: "Your funds were received. Harmonious is finalizing acceptance.", fund_manager: "Funds received; acceptance pending.", harmonious: "Accept subscription." }, { harmonious: "/ops/readiness" }),
  OTHER: R("OTHER", "investor_onboardings", {
    investor: "Harmonious is handling the next step.", fund_manager: "Harmonious is handling the next step.", harmonious: "Review readiness." }, { harmonious: "/ops/readiness" }, false),
};

const ITEM_REASON: Record<string, ReasonCode> = {
  investment_profile: "INVESTOR_PROFILE_INCOMPLETE", personal_info: "INVESTOR_PROFILE_INCOMPLETE", address: "INVESTOR_PROFILE_INCOMPLETE",
  identity: "IDENTITY_VERIFICATION_REQUIRED", kyc: "IDENTITY_VERIFICATION_REQUIRED",
  entity_verification: "ENTITY_REVIEW_REQUIRED", kyb: "ENTITY_REVIEW_REQUIRED", beneficial_owners: "ENTITY_REVIEW_REQUIRED",
  aml: "SCREENING_REVIEW_REQUIRED", sanctions: "SCREENING_REVIEW_REQUIRED",
  accreditation: "ACCREDITATION_REQUIRED", tax_form: "TAX_FORM_REQUIRED",
  signature: "SIGNATURE_REQUIRED", countersignature: "FUND_COUNTERSIGNATURE_REQUIRED",
  approved_to_fund: "APPROVAL_TO_FUND_REQUIRED", exceptions: "OPEN_ISSUE", acceptance: "ACCEPTANCE_REQUIRED",
};

/** Reason for one readiness item, using its status to split funding sub-cases. */
export function reasonForItem(item: { key: string; status: string; action?: string | null }): ReasonCode {
  if (item.key === "funding") {
    if (item.status === "blocked") return "FUNDING_EXCEPTION";
    if (item.status === "needs_harmonious") return "FUNDING_RECONCILIATION_REQUIRED";
    return "FUNDING_REQUIRED";
  }
  return ITEM_REASON[item.key] ?? "OTHER";
}

export type NextActionView = { code: ReasonCode; audience: ReasonAudience | null; text: string; destination: string | null; canResolve: boolean; blocking: boolean };

/**
 * One condition, many presentations: the viewer's wording and - only when the
 * viewer owns the step - a destination. Otherwise it explains who is handling it.
 */
export function nextActionFor(result: Pick<ReadinessResult, "items" | "nextAction">, viewer: ReasonAudience): NextActionView | null {
  if (!result.nextAction || !result.nextAction.owner) return null;
  const item = result.items.find((i) => i.action === result.nextAction!.label && i.owner === result.nextAction!.owner);
  const code = item ? reasonForItem(item) : "OTHER";
  const def = REASONS[code];
  const owner = result.nextAction.owner as ReasonAudience;
  const canResolve = owner === viewer;
  return { code, audience: owner, text: def.wording[viewer], destination: canResolve ? def.destination[viewer] ?? null : null, canResolve, blocking: def.blocking };
}
