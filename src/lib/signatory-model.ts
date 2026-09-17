/**
 * Phase 3C vocabulary — verified firms, professional credentials, delegation
 * acceptance, documented legal authority and delegated signing.
 *
 * Client-safe. Nothing here grants anything; it only names the closed sets the
 * server validates against.
 */
import type { ProfessionalOrgType } from "@/lib/delegation-model";

// ---------------------------------------------------------------- firms ----

export const ORG_VERIFICATION_STATUSES = [
  "draft",
  "submitted",
  "pending_verification",
  "verified",
  "review_required",
  "rejected",
  "reverification_required",
] as const;
export type OrgVerificationStatus = (typeof ORG_VERIFICATION_STATUSES)[number];

export const ORG_VERIFICATION_LABELS: Record<OrgVerificationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending_verification: "Being verified",
  verified: "Verified",
  review_required: "Needs review",
  rejected: "Rejected",
  reverification_required: "Re-verification needed",
};

/** A firm may only be treated as itself once Harmonious has verified it. */
export function orgIsVerified(row: {
  verification_status?: string | null;
  reverification_due_at?: string | null;
}, now = new Date()): boolean {
  if (row?.verification_status !== "verified") return false;
  if (row.reverification_due_at && new Date(row.reverification_due_at) <= now) return false;
  return true;
}

export const ORG_DOCUMENT_TYPES = [
  "formation_document",
  "registration_certificate",
  "license_certificate",
  "regulatory_filing",
  "professional_liability_insurance",
  "engagement_letter",
  "other",
] as const;

// ---------------------------------------------------------- credentials ----

export const CREDENTIAL_TYPES = [
  "attorney_bar",
  "cpa_license",
  "investment_adviser_registration",
  "broker_dealer_affiliation",
  "trustee_fiduciary_capacity",
  "tax_preparer_credential",
  "other_credential",
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_LABELS: Record<CredentialType, string> = {
  attorney_bar: "Attorney — bar admission",
  cpa_license: "CPA licence",
  investment_adviser_registration: "Investment adviser registration",
  broker_dealer_affiliation: "Broker-dealer affiliation",
  trustee_fiduciary_capacity: "Trustee / fiduciary capacity",
  tax_preparer_credential: "Tax professional credential",
  other_credential: "Other credential",
};

export const CREDENTIAL_STATUSES = [
  "unverified",
  "submitted",
  "verified",
  "expired",
  "revoked",
  "rejected",
] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

/**
 * Not every kind of firm is licensed. Where the firm type is a regulated or
 * licensed profession, the individual signing must hold a verified credential.
 * Credential validity is never authority on its own.
 */
export const CREDENTIAL_REQUIRED_BY_ORG_TYPE: Partial<
  Record<ProfessionalOrgType, CredentialType[]>
> = {
  law_firm: ["attorney_bar"],
  accounting_firm: ["cpa_license", "tax_preparer_credential"],
  tax_advisor: ["cpa_license", "tax_preparer_credential"],
  investment_adviser: ["investment_adviser_registration"],
  broker_dealer: ["broker_dealer_affiliation"],
  trustee_fiduciary: ["trustee_fiduciary_capacity"],
};

export function credentialRequirement(orgType: string | null | undefined): CredentialType[] {
  if (!orgType) return [];
  return CREDENTIAL_REQUIRED_BY_ORG_TYPE[orgType as ProfessionalOrgType] ?? [];
}

// ---------------------------------------------------- authority documents --

export const AUTHORITY_DOCUMENT_TYPES = [
  "power_of_attorney",
  "corporate_resolution",
  "board_consent",
  "member_consent",
  "trustee_authorization",
  "operating_agreement_authority",
  "investment_management_authority",
  "advisory_authority",
  "other_authorization",
] as const;
export type AuthorityDocumentType = (typeof AUTHORITY_DOCUMENT_TYPES)[number];

export const AUTHORITY_DOCUMENT_LABELS: Record<AuthorityDocumentType, string> = {
  power_of_attorney: "Power of attorney",
  corporate_resolution: "Corporate resolution",
  board_consent: "Board consent",
  member_consent: "Member consent",
  trustee_authorization: "Trustee authorisation",
  operating_agreement_authority: "Operating agreement authority",
  investment_management_authority: "Investment management authority",
  advisory_authority: "Advisory authority",
  other_authorization: "Other authorisation",
};

export const AUTHORITY_REVIEW_STATUSES = [
  "uploaded",
  "in_review",
  "accepted",
  "rejected",
  "revoked",
  "expired",
  "superseded",
] as const;
export type AuthorityReviewStatus = (typeof AUTHORITY_REVIEW_STATUSES)[number];

export const AUTHORITY_REVIEW_LABELS: Record<AuthorityReviewStatus, string> = {
  uploaded: "Uploaded — not yet reviewed",
  in_review: "In review",
  accepted: "Accepted",
  rejected: "Rejected",
  revoked: "Revoked",
  expired: "Expired",
  superseded: "Replaced",
};

// ------------------------------------------------------ signable documents --

/** The only document types a delegated signature may ever cover. */
export const SIGNABLE_DOCUMENT_TYPES = [
  "subscription_agreement",
  "operating_agreement",
  "side_letter",
  "nda",
  "investor_questionnaire",
  "accreditation_certification",
  "transfer_agreement",
  "consent_or_waiver",
  "tax_form",
] as const;
export type SignableDocumentType = (typeof SIGNABLE_DOCUMENT_TYPES)[number];

export const SIGNABLE_DOCUMENT_LABELS: Record<SignableDocumentType, string> = {
  subscription_agreement: "Subscription agreement",
  operating_agreement: "Operating agreement",
  side_letter: "Side letter",
  nda: "Non-disclosure agreement",
  investor_questionnaire: "Investor questionnaire",
  accreditation_certification: "Accreditation certification",
  transfer_agreement: "Transfer agreement",
  consent_or_waiver: "Consent or waiver",
  tax_form: "Tax form",
};

/**
 * Explicitly disabled in Phase 3C. An authorized signatory never inherits any
 * of these; they belong to the separate financial-control phase.
 */
export const BLOCKED_TRANSACTION_ACTIONS = [
  "change_bank_account",
  "change_routing_information",
  "change_wire_instructions",
  "initiate_outgoing_wire",
  "approve_outgoing_wire",
  "approve_distribution",
  "approve_capital_movement",
  "settle_payment",
  "approve_bank_match",
  "change_beneficiary_payment_instructions",
] as const;

export function isBlockedTransactionAction(value: string): boolean {
  return (BLOCKED_TRANSACTION_ACTIONS as readonly string[]).includes(value);
}

export function isSignableDocumentType(value: unknown): value is SignableDocumentType {
  return (
    typeof value === "string" && (SIGNABLE_DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

// ----------------------------------------------------------- step-up auth --

export const STEP_UP_METHODS = ["otp_email", "authenticator", "webauthn", "reauthentication"] as const;
export type StepUpMethod = (typeof STEP_UP_METHODS)[number];

/** Short-lived on purpose: a signing challenge is good for five minutes. */
export const STEP_UP_TTL_MS = 5 * 60_000;
export const STEP_UP_MAX_ATTEMPTS = 5;
/** The action a signing step-up is bound to. Nothing else satisfies it. */
export const STEP_UP_SIGN_ACTION = "sign_specified_documents";

export const DELEGATION_TERMS_VERSION = "2026-09-delegate-terms-v1";

// ------------------------------------------------------------- deny codes --

export const DENY_CODES = {
  notSignedIn: "not_signed_in",
  noDelegation: "no_live_delegation",
  notAccepted: "delegation_not_accepted",
  renewalRequired: "delegation_renewal_required",
  membership: "organization_membership_inactive",
  orgUnverified: "organization_not_verified",
  credential: "professional_credential_required",
  authority: "authority_level_insufficient",
  capability: "sign_capability_not_granted",
  noAuthorityDocument: "authority_document_required",
  authorityDocumentScope: "authority_document_scope_mismatch",
  scope: "out_of_scope",
  documentType: "document_type_not_authorised",
  blocked: "transaction_authority_disabled",
  stepUp: "step_up_authentication_required",
} as const;

export const DENY_MESSAGES: Record<string, string> = {
  not_signed_in: "You are not signed in.",
  no_live_delegation: "There is no live authorisation for this.",
  delegation_not_accepted: "You have not accepted this delegation yet.",
  delegation_renewal_required: "This delegation changed and must be accepted again.",
  organization_membership_inactive: "Your seat at this firm is not active.",
  organization_not_verified: "This firm has not completed Harmonious verification.",
  professional_credential_required: "A verified professional credential is required to sign.",
  authority_level_insufficient: "This authorisation does not carry signing authority.",
  sign_capability_not_granted: "Signing was not granted on this authorisation.",
  authority_document_required: "An accepted authority document is required before signing.",
  authority_document_scope_mismatch: "The authority document does not cover this.",
  out_of_scope: "This is outside the authorised scope.",
  document_type_not_authorised: "This document type is not covered by the authority.",
  transaction_authority_disabled: "Money movement is never available through delegated authority.",
  step_up_authentication_required: "Confirm your identity again before signing.",
};
