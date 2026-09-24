/**
 * Fund Administration Phase B — pure investor-onboarding rules.
 *
 * No database access, no authorization, no side effects. This module decides
 * WHAT an investor still has to do, WHICH of their existing verified records
 * may be reused, and WHETHER an investment may be funded, accepted or closed.
 * Everything that touches the database lives in investor-onboarding.server.ts.
 *
 * Deny by default: an unknown value never evaluates as valid, verified,
 * funded or closable.
 */

import {
  ENTITY_PROFILE_TYPES,
  GATING_RELATIONSHIP_ROLES,
  missingRelatedRoles,
  type InvestmentProfileType,
} from "@/lib/identity-model";

// ------------------------------------------------------------------ stages

export const ONBOARDING_STAGES = [
  "started",
  "profile_selected",
  "verification",
  "eligibility",
  "tax",
  "subscription",
  "signature",
  "harmonious_review",
  "approved_to_fund",
  "awaiting_funds",
  "funded",
  "accepted",
  "closed",
  "declined",
  "cancelled",
] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export const STAGE_LABELS: Record<OnboardingStage, string> = {
  started: "Started",
  profile_selected: "Investment profile chosen",
  verification: "Verification",
  eligibility: "Eligibility & accreditation",
  tax: "Tax documentation",
  subscription: "Subscription information",
  signature: "Signature required",
  harmonious_review: "Harmonious review",
  approved_to_fund: "Approved to fund",
  awaiting_funds: "Awaiting funds",
  funded: "Funded",
  accepted: "Subscription accepted",
  closed: "Closed / admitted",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** Only these moves are legal. Anything else is refused server-side. */
export const STAGE_TRANSITIONS: Record<OnboardingStage, readonly OnboardingStage[]> = {
  started: ["profile_selected", "cancelled", "declined"],
  profile_selected: ["verification", "started", "cancelled", "declined"],
  verification: ["eligibility", "profile_selected", "cancelled", "declined"],
  eligibility: ["tax", "verification", "cancelled", "declined"],
  tax: ["subscription", "eligibility", "cancelled", "declined"],
  subscription: ["signature", "tax", "cancelled", "declined"],
  signature: ["harmonious_review", "subscription", "cancelled", "declined"],
  harmonious_review: ["approved_to_fund", "signature", "subscription", "declined", "cancelled"],
  approved_to_fund: ["awaiting_funds", "harmonious_review", "declined", "cancelled"],
  awaiting_funds: ["funded", "approved_to_fund", "declined", "cancelled"],
  funded: ["accepted", "awaiting_funds", "declined"],
  accepted: ["closed", "funded", "declined"],
  closed: [],
  declined: [],
  cancelled: ["started"],
};

export function isOnboardingStage(value: unknown): value is OnboardingStage {
  return typeof value === "string" && (ONBOARDING_STAGES as readonly string[]).includes(value);
}

export function stageTransitionError(from: unknown, to: unknown): string | null {
  if (!isOnboardingStage(from) || !isOnboardingStage(to)) return "That onboarding stage is not recognised.";
  if (from === to) return null;
  if (!STAGE_TRANSITIONS[from].includes(to)) {
    return `An investment cannot move from ${STAGE_LABELS[from]} to ${STAGE_LABELS[to]}.`;
  }
  return null;
}

// --------------------------------------------------------- invitations

export const INVITATION_STATUSES = [
  "invited",
  "opened",
  "account_created",
  "onboarding",
  "submitted",
  "approved",
  "funding",
  "funded",
  "accepted",
  "closed",
  "expired",
  "declined",
  "cancelled",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

const TERMINAL_INVITATION: ReadonlySet<string> = new Set(["expired", "declined", "cancelled", "revoked"]);

/**
 * An invitation is a pointer, never an authorization. It can be usable or not;
 * it never by itself proves who the caller is.
 */
export function invitationUsableError(
  invitation: { status?: string | null; expires_at?: string | null } | null | undefined,
  nowIso: string,
): string | null {
  if (!invitation) return "That invitation was not found.";
  const status = String(invitation.status ?? "");
  if (TERMINAL_INVITATION.has(status)) return "That invitation is no longer valid.";
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= new Date(nowIso).getTime()) {
    return "That invitation has expired.";
  }
  return null;
}

/** The onboarding stage mapped back onto the invitation lifecycle. */
export function invitationStatusForStage(stage: OnboardingStage): InvitationStatus {
  switch (stage) {
    case "started":
    case "profile_selected":
      return "account_created";
    case "verification":
    case "eligibility":
    case "tax":
    case "subscription":
    case "signature":
      return "onboarding";
    case "harmonious_review":
      return "submitted";
    case "approved_to_fund":
      return "approved";
    case "awaiting_funds":
      return "funding";
    case "funded":
      return "funded";
    case "accepted":
      return "accepted";
    case "closed":
      return "closed";
    case "declined":
      return "declined";
    case "cancelled":
      return "cancelled";
  }
}

// ----------------------------------------------------- requirement engine

export const REQUIREMENT_KEYS = [
  "account",
  "investment_profile",
  "identity_verification",
  "entity_verification",
  "beneficial_owners",
  "aml",
  "eligibility",
  "accreditation",
  "tax_classification",
  "tax_documentation",
  "bsa_aml",
  "bad_actor",
  "investment_amount",
  "subscription_questionnaire",
  "certifications",
  "subscription_documents",
  "signature",
  "funding",
] as const;
export type RequirementKey = (typeof REQUIREMENT_KEYS)[number];

export const REQUIREMENT_LABELS: Record<RequirementKey, string> = {
  account: "Account",
  investment_profile: "Investment profile",
  identity_verification: "Identity verification",
  entity_verification: "Entity verification",
  beneficial_owners: "Owners and signers",
  aml: "Compliance screening",
  eligibility: "Eligibility",
  accreditation: "Accreditation",
  tax_classification: "Tax classification",
  tax_documentation: "Tax form",
  bsa_aml: "Financial background",
  bad_actor: "Compliance questionnaire",
  certifications: "Review & certify",
  investment_amount: "Investment amount",
  subscription_questionnaire: "Subscription information",
  subscription_documents: "Subscription documents",
  signature: "Signature",
  funding: "Funding",
};

export const REQUIREMENT_STATES = [
  "valid",
  "refresh_required",
  "missing",
  "review_required",
  "not_applicable",
] as const;
export type RequirementState = (typeof REQUIREMENT_STATES)[number];

/** Investor-facing wording. Internal vocabulary never reaches the browser. */
export const REQUIREMENT_STATE_LABELS: Record<RequirementState, string> = {
  valid: "Complete",
  refresh_required: "Needs updating",
  missing: "Action required",
  review_required: "In review",
  not_applicable: "Not needed",
};

export interface RequirementResult {
  key: RequirementKey;
  label: string;
  state: RequirementState;
  reason?: string;
}

export interface OfferingRequirements {
  /** Configured during fund setup — never assumed to be 506(c). */
  accreditationRequired: boolean;
  accreditationMethod?: string | null;
  qualifiedPurchaserRequired?: boolean;
  kycRequired: boolean;
  kybRequired: boolean;
  amlRequired: boolean;
  taxDocumentRequired: boolean;
  subscriptionQuestionnaireRequired: boolean;
  minInvestmentCents?: number | null;
  maxInvestmentCents?: number | null;
  remainingCapacityCents?: number | null;
  permittedJurisdictions?: string[] | null;
  permittedProfileTypes?: string[] | null;
  foreignInvestorsPermitted?: boolean;
}

export interface PersonFacts {
  personId?: string | null;
  kycStatus?: string | null;
  kycExpiresAt?: string | null;
  amlStatus?: string | null;
  amlCompletedAt?: string | null;
  countryOfResidence?: string | null;
}

export interface ProfileFacts {
  profileId?: string | null;
  profileType?: InvestmentProfileType | string | null;
  kybStatus?: string | null;
  entityAmlStatus?: string | null;
  entityVerificationExpiresAt?: string | null;
  /** Gating related people (control persons, trustees, signers, beneficial owners). */
  relatedPeople?: { role: string; personId?: string | null; kycStatus?: string | null }[];
  accreditationStatus?: string | null;
  accreditationExpiresAt?: string | null;
  accreditationMethod?: string | null;
  taxFormStatus?: string | null;
  taxFormExpiresOn?: string | null;
  taxClassification?: string | null;
  isForeign?: boolean;
  jurisdiction?: string | null;
}

export interface SubscriptionFacts {
  requestedAmountCents?: number | null;
  questionnaireVersion?: number | null;
  questionnaireComplete?: boolean;
  documentsPrepared?: boolean;
  signatureStatus?: string | null;
  fundingStatus?: string | null;
}

const VERIFIED = new Set(["verified", "approved", "passed", "clear", "complete", "completed"]);
const IN_REVIEW = new Set(["review", "review_required", "in_review", "pending_review", "manual_review", "submitted", "pending"]);
const FAILED = new Set(["failed", "rejected", "denied"]);

function expired(at: string | null | undefined, nowIso: string): boolean {
  if (!at) return false;
  return new Date(at).getTime() <= new Date(nowIso).getTime();
}

/**
 * A verification is only reusable when it is genuinely valid today. Having
 * invested before is never, on its own, a reason to skip a check.
 */
export function reuseState(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
  nowIso: string,
): RequirementState {
  const value = String(status ?? "").toLowerCase();
  if (!value || value === "not_started" || value === "none") return "missing";
  if (FAILED.has(value)) return "review_required";
  if (IN_REVIEW.has(value)) return "review_required";
  if (VERIFIED.has(value)) return expired(expiresAt, nowIso) ? "refresh_required" : "valid";
  return "missing";
}

export interface DeterminationInput {
  offering: OfferingRequirements;
  person: PersonFacts;
  profile: ProfileFacts | null;
  subscription: SubscriptionFacts;
  nowIso: string;
  /**
   * Stage 2 results, resolved server-side from onboarding-compliance-model.
   * When present they are authoritative for their requirement.
   */
  compliance?: {
    tax?: { state: RequirementState; reason?: string | undefined };
    taxClassification?: { state: RequirementState; reason?: string | undefined };
    bsaAml?: { state: RequirementState; reason?: string | undefined };
    badActor?: { state: RequirementState; reason?: string | undefined };
    offeringEligibility?: { state: RequirementState; reason?: string | undefined };
    certifications?: { state: RequirementState; reason?: string | undefined };
  } | undefined;
}

/**
 * determineOnboardingRequirements — the returning-investor engine.
 * Reuses everything that is currently valid, refreshes everything that is not.
 */
export function determineOnboardingRequirements(input: DeterminationInput): RequirementResult[] {
  const { offering, person, profile, subscription, nowIso } = input;
  const out: RequirementResult[] = [];
  const add = (key: RequirementKey, state: RequirementState, reason?: string) =>
    out.push({ key, label: REQUIREMENT_LABELS[key], state, ...(reason ? { reason } : {}) });

  add("account", person.personId ? "valid" : "missing");

  if (!profile?.profileId) {
    add("investment_profile", "missing", "Tell us who is making this investment.");
    return out;
  }
  const profileType = String(profile.profileType ?? "");
  const isEntity = ENTITY_PROFILE_TYPES.has(profileType as InvestmentProfileType);
  const permitted = offering.permittedProfileTypes;
  if (permitted && permitted.length > 0 && !permitted.includes(profileType)) {
    add("investment_profile", "review_required", "This fund does not currently accept this kind of investor.");
  } else {
    add("investment_profile", "valid");
  }

  add(
    "identity_verification",
    offering.kycRequired ? reuseState(person.kycStatus, person.kycExpiresAt, nowIso) : "not_applicable",
  );

  if (!isEntity) {
    add("entity_verification", "not_applicable");
    const gaps = missingRelatedRoles(profileType, (profile.relatedPeople ?? []).map((p) => p.role));
    const pending = (profile.relatedPeople ?? []).filter(
      (p) => GATING_RELATIONSHIP_ROLES.has(p.role as any) && reuseState(p.kycStatus, null, nowIso) !== "valid",
    );
    if (gaps.length === 0 && (profile.relatedPeople ?? []).length === 0) add("beneficial_owners", "not_applicable");
    else if (gaps.length) add("beneficial_owners", "missing", `We still need: ${gaps.map((g) => g[0]!.replace(/_/g, " ")).join(", ")}.`);
    else add("beneficial_owners", pending.length ? "missing" : "valid", pending.length ? `${pending.length} person(s) still need to verify their identity.` : undefined);
  } else if (!offering.kybRequired) {
    add("entity_verification", "not_applicable");
    add("beneficial_owners", "not_applicable");
  } else {
    add(
      "entity_verification",
      reuseState(profile.kybStatus, profile.entityVerificationExpiresAt, nowIso),
    );
    const gating = profile.relatedPeople ?? [];
    const gaps = missingRelatedRoles(profileType, gating.map((p) => p.role));
    if (gaps.length > 0) {
      add(
        "beneficial_owners",
        "missing",
        `We still need: ${gaps.map((g) => g[0]!.replace(/_/g, " ")).join(", ")}.`,
      );
    } else if (gating.length === 0) {
      add("beneficial_owners", "missing", "We still need the people who own or control this entity.");
    } else {
      const unverified = gating.filter(
        (p) => reuseState(p.kycStatus, null, nowIso) !== "valid",
      );
      add(
        "beneficial_owners",
        unverified.length === 0 ? "valid" : "missing",
        unverified.length ? `${unverified.length} person(s) still need to verify their identity.` : undefined,
      );
    }
  }

  const amlStatus = isEntity ? (profile.entityAmlStatus ?? person.amlStatus) : person.amlStatus;
  add("aml", offering.amlRequired ? reuseState(amlStatus, null, nowIso) : "not_applicable");

  // Eligibility is the offering's own configured rule set.
  const eligibilityProblems: string[] = [];
  if (profile.isForeign && offering.foreignInvestorsPermitted === false) {
    eligibilityProblems.push("This fund is open to U.S. investors only.");
  }
  const jurisdictions = offering.permittedJurisdictions;
  if (jurisdictions && jurisdictions.length > 0) {
    const where = profile.jurisdiction ?? person.countryOfResidence ?? null;
    if (!where) eligibilityProblems.push("We still need to know where you are resident.");
    else if (!jurisdictions.includes(where)) eligibilityProblems.push("This fund is not offered in your location.");
  }
  const oe = input.compliance?.offeringEligibility;
  if (eligibilityProblems.length) add("eligibility", "review_required", eligibilityProblems[0]);
  else if (oe && oe.state !== "valid" && oe.state !== "not_applicable") add("eligibility", oe.state, oe.reason);
  else add("eligibility", "valid");

  if (!offering.accreditationRequired) {
    add("accreditation", "not_applicable");
  } else {
    const state = reuseState(profile.accreditationStatus, profile.accreditationExpiresAt, nowIso);
    // Self-selection alone never reads as accredited when the offering requires
    // third-party or documentary verification.
    const method = String(profile.accreditationMethod ?? "").toLowerCase();
    const requiredMethod = String(offering.accreditationMethod ?? "").toLowerCase();
    if (
      state === "valid" &&
      requiredMethod &&
      requiredMethod !== "self_certification" &&
      (method === "self_certification" || !method)
    ) {
      add("accreditation", "review_required", "This fund requires independent verification of your accreditation.");
    } else {
      add("accreditation", state);
    }
  }

  if (!offering.taxDocumentRequired) add("tax_documentation", "not_applicable");
  else if (input.compliance?.tax) add("tax_documentation", input.compliance.tax.state, input.compliance.tax.reason);
  else add("tax_documentation", reuseState(profile.taxFormStatus, profile.taxFormExpiresOn, nowIso));

  const tc = input.compliance?.taxClassification;
  add("tax_classification", offering.taxDocumentRequired ? (tc?.state ?? "not_applicable") : "not_applicable", tc?.reason);
  const bsa = input.compliance?.bsaAml;
  add("bsa_aml", bsa?.state ?? "not_applicable", bsa?.reason);

  const ba = input.compliance?.badActor;
  add("bad_actor", ba?.state ?? "not_applicable", ba?.reason);

  const amount = Number(subscription.requestedAmountCents ?? 0);
  add(
    "investment_amount",
    amount > 0 && !amountError(amount, offering) ? "valid" : "missing",
    amountError(amount, offering) ?? undefined,
  );

  add(
    "subscription_questionnaire",
    !offering.subscriptionQuestionnaireRequired
      ? "not_applicable"
      : subscription.questionnaireComplete
        ? "valid"
        : "missing",
  );

  const cert = input.compliance?.certifications;
  add("certifications", cert?.state ?? "not_applicable", cert?.reason);

  add("subscription_documents", subscription.documentsPrepared ? "valid" : "missing");

  const sig = String(subscription.signatureStatus ?? "").toLowerCase();
  add("signature", sig === "completed" || sig === "signed" ? "valid" : "missing");

  add("funding", subscription.fundingStatus === "funded" ? "valid" : "missing");

  return out;
}

/** Requirements that must be satisfied before Harmonious may review at all. */
const PRE_REVIEW: readonly RequirementKey[] = [
  "account",
  "investment_profile",
  "identity_verification",
  "entity_verification",
  "beneficial_owners",
  "aml",
  "eligibility",
  "accreditation",
  "tax_classification",
  "tax_documentation",
  "bsa_aml",
  "bad_actor",
  "investment_amount",
  "subscription_questionnaire",
  "certifications",
  "subscription_documents",
  "signature",
];

export function outstandingRequirements(
  requirements: RequirementResult[],
  keys: readonly RequirementKey[] = PRE_REVIEW,
): RequirementResult[] {
  return requirements.filter((r) => keys.includes(r.key) && r.state !== "valid" && r.state !== "not_applicable");
}

// ------------------------------------------------------------- amounts

export function amountError(amountCents: number, offering: OfferingRequirements): string | null {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return "Enter the amount you would like to invest.";
  if (!Number.isInteger(amountCents)) return "Enter a whole amount.";
  const min = Number(offering.minInvestmentCents ?? 0);
  if (min > 0 && amountCents < min) {
    return `The minimum investment in this fund is $${(min / 100).toLocaleString("en-US")}.`;
  }
  const max = Number(offering.maxInvestmentCents ?? 0);
  if (max > 0 && amountCents > max) {
    return `The maximum investment in this fund is $${(max / 100).toLocaleString("en-US")}.`;
  }
  const capacity = offering.remainingCapacityCents;
  if (typeof capacity === "number" && capacity >= 0 && amountCents > capacity) {
    return "This fund does not have that much capacity remaining.";
  }
  return null;
}

// ------------------------------------------------------------- funding

export const FUNDING_STATUSES = [
  "not_funded",
  "investor_reports_sent",
  "bank_transaction_detected",
  "reconciliation_pending",
  "partially_funded",
  "funded",
  "overfunded",
  "funding_exception",
  "returned",
] as const;
export type FundingStatus = (typeof FUNDING_STATUSES)[number];

export const FUNDING_STATUS_LABELS: Record<FundingStatus, string> = {
  not_funded: "Not funded",
  investor_reports_sent: "Investor says funds were sent",
  bank_transaction_detected: "Bank activity detected",
  reconciliation_pending: "Confirming with the bank",
  partially_funded: "Partly funded",
  funded: "Funded",
  overfunded: "Overfunded",
  funding_exception: "Funding exception",
  returned: "Returned",
};

/** Statuses an investor may cause. "Funded" is never one of them. */
export const INVESTOR_SETTABLE_FUNDING: ReadonlySet<FundingStatus> = new Set<FundingStatus>([
  "investor_reports_sent",
]);

/**
 * Funding status is derived from reconciled cash, never from what anyone says.
 * `reconciledCents` must come from approved bank reconciliations only.
 */
export function deriveFundingStatus(input: {
  acceptedAmountCents: number;
  reconciledCents: number;
  pendingBankCents?: number;
  investorReportsSent?: boolean;
  hasException?: boolean;
  returned?: boolean;
}): FundingStatus {
  if (input.returned) return "returned";
  if (input.hasException) return "funding_exception";
  const expected = Number(input.acceptedAmountCents ?? 0);
  const got = Number(input.reconciledCents ?? 0);
  if (got > 0 && expected > 0) {
    if (got > expected) return "overfunded";
    if (got === expected) return "funded";
    return "partially_funded";
  }
  if ((input.pendingBankCents ?? 0) > 0) return "reconciliation_pending";
  if (input.investorReportsSent) return "investor_reports_sent";
  return "not_funded";
}

// ------------------------------------------------------------- gates

export interface FundingGateInput {
  stage: OnboardingStage;
  requirements: RequirementResult[];
  approvedToFundAt?: string | null;
  openBlockingExceptions: number;
}

/** canInvestorFund — funding instructions stay locked until every one of these holds. */
export function canInvestorFund(input: FundingGateInput): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.openBlockingExceptions > 0) reasons.push("There is an open issue on this investment.");
  for (const r of outstandingRequirements(input.requirements)) {
    reasons.push(`${r.label}: ${REQUIREMENT_STATE_LABELS[r.state]}`);
  }
  if (!input.approvedToFundAt) reasons.push("Harmonious has not yet approved this investor to fund.");
  if (!["approved_to_fund", "awaiting_funds", "funded", "accepted"].includes(input.stage)) {
    reasons.push("This investment is not at the funding stage.");
  }
  return { allowed: reasons.length === 0, reasons };
}

export interface ClosingGateInput extends FundingGateInput {
  fundingStatus: FundingStatus;
  fundingReconciled: boolean;
  acceptedAt?: string | null;
  acceptedAmountCents?: number | null;
}

/** canCloseInvestment — the final server-side admission gate. */
export function canCloseInvestment(input: ClosingGateInput): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const funding = canInvestorFund(input);
  reasons.push(...funding.reasons);
  if (!input.fundingReconciled) reasons.push("The money has not been reconciled to the fund's bank account.");
  if (input.fundingStatus !== "funded") reasons.push(`Funding is ${FUNDING_STATUS_LABELS[input.fundingStatus]}.`);
  if (!input.acceptedAt) reasons.push("The subscription has not been accepted yet.");
  if (!input.acceptedAmountCents || input.acceptedAmountCents <= 0) {
    reasons.push("No accepted subscription amount is recorded.");
  }
  return { allowed: reasons.length === 0, reasons };
}

// ------------------------------------------------------------ exceptions

export const EXCEPTION_TYPES = [
  "kyc_failed",
  "kyb_incomplete",
  "beneficial_owner_missing",
  "aml_review",
  "accreditation_incomplete",
  "accreditation_expired",
  "tax_document_missing",
  "tax_document_expired",
  "subscription_incomplete",
  "signature_missing",
  "funding_mismatch",
  "duplicate_payment",
  "overfunding",
  "underfunding",
  "capacity_exceeded",
  "document_version_changed",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  kyc_failed: "Identity verification failed",
  kyb_incomplete: "Entity verification incomplete",
  beneficial_owner_missing: "Owner or signer missing",
  aml_review: "Compliance review",
  accreditation_incomplete: "Accreditation incomplete",
  accreditation_expired: "Accreditation expired",
  tax_document_missing: "Tax document missing",
  tax_document_expired: "Tax document expired",
  subscription_incomplete: "Subscription incomplete",
  signature_missing: "Signature missing",
  funding_mismatch: "Funding does not match",
  duplicate_payment: "Duplicate payment",
  overfunding: "Overfunding",
  underfunding: "Underfunding",
  capacity_exceeded: "Fund capacity exceeded",
  document_version_changed: "Documents changed before signature",
};

export const EXCEPTION_SEVERITIES = ["blocking", "warning", "informational"] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

export const EXCEPTION_OWNERS = ["harmonious", "investor", "manager", "third_party"] as const;
export type ExceptionOwner = (typeof EXCEPTION_OWNERS)[number];

export function isExceptionType(value: unknown): value is ExceptionType {
  return typeof value === "string" && (EXCEPTION_TYPES as readonly string[]).includes(value);
}

// ------------------------------------------------- reconciliation matching

export interface CandidateSubscription {
  onboardingId: string;
  offeringId: string;
  investorUserId: string;
  investmentProfileId: string | null;
  expectedAmountCents: number;
  reference?: string | null;
}

export interface BankActivity {
  offeringId: string;
  amountCents: number;
  reference?: string | null;
  postedOn?: string | null;
  transactionId: string;
}

export type MatchOutcome =
  | { kind: "matched"; onboardingId: string; confidence: "high" | "medium"; reasons: string[] }
  | { kind: "exception"; reason: string; candidates: string[] };

/**
 * Never guess between two plausible investors: an ambiguous transaction goes
 * to the reconciliation exception queue instead of being assigned.
 */
export function matchBankActivity(
  activity: BankActivity,
  candidates: CandidateSubscription[],
  alreadyAppliedTransactionIds: readonly string[] = [],
): MatchOutcome {
  if (alreadyAppliedTransactionIds.includes(activity.transactionId)) {
    return { kind: "exception", reason: "This bank transaction has already been applied.", candidates: [] };
  }
  const inFund = candidates.filter((c) => c.offeringId === activity.offeringId);
  if (inFund.length === 0) {
    return { kind: "exception", reason: "No investor in this fund is expecting money.", candidates: [] };
  }

  const ref = String(activity.reference ?? "").trim().toLowerCase();
  if (ref) {
    const byRef = inFund.filter((c) => String(c.reference ?? "").trim().toLowerCase() === ref);
    if (byRef.length === 1) {
      const only = byRef[0]!;
      return {
        kind: "matched",
        onboardingId: only.onboardingId,
        confidence: only.expectedAmountCents === activity.amountCents ? "high" : "medium",
        reasons: ["Reference code matched"],
      };
    }
    if (byRef.length > 1) {
      return {
        kind: "exception",
        reason: "More than one investor is using that reference.",
        candidates: byRef.map((c) => c.onboardingId),
      };
    }
  }

  const byAmount = inFund.filter((c) => c.expectedAmountCents === activity.amountCents);
  if (byAmount.length === 1) {
    return {
      kind: "matched",
      onboardingId: byAmount[0]!.onboardingId,
      confidence: "medium",
      reasons: ["Amount matched exactly"],
    };
  }
  if (byAmount.length > 1) {
    return {
      kind: "exception",
      reason: "Several investors are expected to send the same amount.",
      candidates: byAmount.map((c) => c.onboardingId),
    };
  }
  return { kind: "exception", reason: "No investor matches this payment.", candidates: [] };
}

// ------------------------------------------------------- questionnaires

export const QUESTION_TYPES = [
  "yes_no",
  "text",
  "number",
  "currency",
  "date",
  "select",
  "multi_select",
  "certification",
  "document",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Question {
  key: string;
  label: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
  /** Shown only when another answer equals one of these values. */
  showWhen?: { key: string; equals: (string | boolean | number)[] };
}

export function questionVisible(question: Question, answers: Record<string, unknown>): boolean {
  const cond = question.showWhen;
  if (!cond) return true;
  const value = answers[cond.key];
  return cond.equals.some((v) => v === value);
}

export function validateQuestionnaire(
  questions: Question[],
  answers: Record<string, unknown>,
): { valid: boolean; errors: { key: string; message: string }[] } {
  const errors: { key: string; message: string }[] = [];
  for (const q of questions) {
    if (!questionVisible(q, answers)) continue;
    const value = answers[q.key];
    const empty =
      value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (q.required && empty) {
      errors.push({ key: q.key, message: `${q.label} is required.` });
      continue;
    }
    if (empty) continue;
    if (q.type === "certification" && value !== true) {
      errors.push({ key: q.key, message: `${q.label} must be confirmed.` });
    }
    if ((q.type === "number" || q.type === "currency") && typeof value !== "number") {
      errors.push({ key: q.key, message: `${q.label} must be a number.` });
    }
    if (q.type === "select" && q.options && !q.options.includes(String(value))) {
      errors.push({ key: q.key, message: `Choose one of the listed answers for ${q.label}.` });
    }
    if (q.type === "multi_select" && q.options) {
      const values = Array.isArray(value) ? value.map(String) : [];
      if (values.some((v) => !q.options!.includes(v))) {
        errors.push({ key: q.key, message: `Choose from the listed answers for ${q.label}.` });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// -------------------------------------------------------------- signature

export const SIGNATURE_STATES = ["prepared", "sent", "viewed", "signed", "completed"] as const;
export type SignatureState = (typeof SIGNATURE_STATES)[number];

export function signatureTransitionError(from: string, to: string): string | null {
  const order = SIGNATURE_STATES as readonly string[];
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return "That signature state is not recognised.";
  if (b < a) return "A signature cannot move backwards.";
  return null;
}

/** "Signed by Jane Doe, as Managing Member, on behalf of Example Holdings LLC" */
export function signatureAttribution(input: {
  signerName: string;
  capacity?: string | null;
  entityName?: string | null;
}): string {
  if (!input.entityName) return `Signed by ${input.signerName}`;
  const capacity = input.capacity ? `, as ${input.capacity},` : "";
  return `Signed by ${input.signerName}${capacity} on behalf of ${input.entityName}`;
}

// ------------------------------------------------------------ ops queue

export const QUEUE_BUCKETS = [
  "new",
  "in_progress",
  "waiting_on_investor",
  "compliance_review",
  "accreditation_review",
  "tax_issue",
  "document_review",
  "signature_required",
  "ready_for_approval",
  "approved_to_fund",
  "awaiting_funds",
  "funding_exception",
  "funded",
  "ready_to_accept",
  "accepted",
  "ready_to_close",
  "closed",
] as const;
export type QueueBucket = (typeof QUEUE_BUCKETS)[number];

export const QUEUE_BUCKET_LABELS: Record<QueueBucket, string> = {
  new: "New",
  in_progress: "In progress",
  waiting_on_investor: "Waiting on investor",
  compliance_review: "Compliance review",
  accreditation_review: "Accreditation review",
  tax_issue: "Tax issue",
  document_review: "Document review",
  signature_required: "Signature required",
  ready_for_approval: "Ready for approval",
  approved_to_fund: "Approved to fund",
  awaiting_funds: "Awaiting funds",
  funding_exception: "Funding exception",
  funded: "Funded",
  ready_to_accept: "Ready to accept",
  accepted: "Accepted",
  ready_to_close: "Ready to close",
  closed: "Closed",
};

export function queueBucket(input: {
  stage: OnboardingStage;
  fundingStatus: FundingStatus;
  requirements: RequirementResult[];
  exceptionTypes: ExceptionType[];
  acceptedAt?: string | null;
}): QueueBucket {
  const state = (key: RequirementKey) => input.requirements.find((r) => r.key === key)?.state;

  if (input.stage === "closed") return "closed";
  if (input.stage === "accepted") return "ready_to_close";
  if (input.stage === "funded") return input.acceptedAt ? "accepted" : "ready_to_accept";
  if (input.fundingStatus === "funding_exception") return "funding_exception";
  if (input.stage === "awaiting_funds") return "awaiting_funds";
  if (input.stage === "approved_to_fund") return "approved_to_fund";

  if (input.exceptionTypes.some((t) => t === "tax_document_missing" || t === "tax_document_expired")) {
    return "tax_issue";
  }
  if (state("aml") === "review_required") return "compliance_review";
  if (state("accreditation") === "review_required") return "accreditation_review";
  if (state("identity_verification") === "review_required" || state("entity_verification") === "review_required") {
    return "compliance_review";
  }
  if (input.stage === "harmonious_review") {
    return outstandingRequirements(input.requirements).length === 0 ? "ready_for_approval" : "document_review";
  }
  if (state("signature") === "missing" && state("subscription_documents") === "valid") {
    return "signature_required";
  }
  if (input.stage === "started") return "new";
  if (outstandingRequirements(input.requirements).some((r) => r.state === "missing")) {
    return "waiting_on_investor";
  }
  return "in_progress";
}

// ------------------------------------------------- manager-safe redaction

/**
 * Fund managers see progress, never the underlying compliance material. This
 * strips provider payloads, identifiers and anything personal-tax related.
 */
export function managerSafeView<T extends Record<string, any>>(row: T): Record<string, unknown> {
  const blocked = new Set([
    "decision",
    "result",
    "matches",
    "questionnaire",
    "tax_id_reference",
    "tax_id_last4",
    "tin",
    "tin_last4",
    "ssn",
    "review_notes",
    "internal_note",
    "beneficial_ownership",
    "executed_snapshot",
    "provider_payload",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (blocked.has(key)) continue;
    out[key] = value;
  }
  return out;
}

// ------------------------------------------------------------ progress UI

export interface ProgressStep {
  key: RequirementKey;
  label: string;
  state: RequirementState;
  locked: boolean;
}

/** One plain-language checklist. Funding stays locked until approval. */
export function progressChecklist(
  requirements: RequirementResult[],
  approvedToFund: boolean,
): ProgressStep[] {
  return requirements.map((r) => ({
    key: r.key,
    label: REQUIREMENT_LABELS[r.key],
    state: r.state,
    locked: r.key === "funding" && !approvedToFund,
  }));
}
