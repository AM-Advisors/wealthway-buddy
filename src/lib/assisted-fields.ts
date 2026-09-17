/**
 * Phase 3B — what a professional may prepare, and what they may never touch.
 *
 * Two lists, both closed:
 *
 *  - ASSISTED_FIELDS: the only fields a professional may put into a draft, per
 *    kind of preparation. Anything not on the list is rejected outright, so
 *    there is never a generic "update the profile" endpoint taking arbitrary
 *    columns.
 *  - PROTECTED_FIELDS: authoritative verification, provider, money, signature
 *    and authority state. These can never appear in a draft, can never be
 *    applied, and are re-checked when a client approves.
 */
import type { DelegationCapability } from "@/lib/delegation-model";

export const ASSISTED_DRAFT_TYPES = [
  "profile_contact",
  "entity_information",
  "ownership_information",
  "investment_questionnaire",
  "kyc_support",
  "kyb_support",
  "accreditation",
  "investment",
] as const;
export type AssistedDraftType = (typeof ASSISTED_DRAFT_TYPES)[number];

export const DRAFT_TYPE_LABELS: Record<AssistedDraftType, string> = {
  profile_contact: "Contact details",
  entity_information: "Entity information",
  ownership_information: "Ownership and control people",
  investment_questionnaire: "Investment questionnaire",
  kyc_support: "Identity check support",
  kyb_support: "Entity check support",
  accreditation: "Accreditation information",
  investment: "Prepared investment",
};

/** Each kind of preparation needs its own explicitly granted permission. */
export const DRAFT_TYPE_CAPABILITY: Record<AssistedDraftType, DelegationCapability> = {
  profile_contact: "edit_profile_info",
  entity_information: "edit_profile_info",
  ownership_information: "edit_profile_info",
  investment_questionnaire: "prepare_investment",
  kyc_support: "assist_kyc",
  kyb_support: "assist_kyb",
  accreditation: "assist_accreditation",
  investment: "prepare_investment",
};

/** Which kind of resource the preparation is attached to. */
export const DRAFT_TYPE_TARGET: Record<AssistedDraftType, "person" | "investment_profile" | "investment"> = {
  profile_contact: "person",
  entity_information: "investment_profile",
  ownership_information: "investment_profile",
  investment_questionnaire: "investment",
  kyc_support: "person",
  kyb_support: "investment_profile",
  accreditation: "investment_profile",
  investment: "investment_profile",
};

export const ASSISTED_FIELDS: Record<AssistedDraftType, readonly string[]> = {
  profile_contact: [
    "preferred_name",
    "phone",
    "email",
    "address_line1",
    "address_line2",
    "city",
    "region",
    "postal_code",
    "country",
    "citizenship_country",
    "residence_country",
    "tax_residency_country",
  ],
  entity_information: [
    "legal_name",
    "entity_type",
    "formation_jurisdiction",
    "formation_date",
    "address_line1",
    "address_line2",
    "city",
    "region",
    "postal_code",
    "country",
    "trust_type",
    "trust_date",
  ],
  ownership_information: ["beneficial_ownership", "control_persons", "trustees"],
  investment_questionnaire: ["questionnaire", "note"],
  // Support only: assembled information and document references. Nothing here
  // is ever a verification result.
  kyc_support: ["documents", "note"],
  kyb_support: ["documents", "note"],
  // Prepared accreditation evidence — never a determination.
  accreditation: ["basis", "verification_method", "evidence", "expires_at", "note"],
  investment: ["profile_id", "offering_id", "commitment_cents", "questionnaire", "note"],
};

/**
 * Authoritative state. A professional may never write, propose or approve any
 * of these, whatever the delegation says.
 */
export const PROTECTED_FIELDS: readonly string[] = [
  "kyc_status",
  "kyc_result",
  "aml_status",
  "aml_result",
  "kyb_status",
  "entity_aml_status",
  "accreditation_status",
  "status",
  "verification_status",
  "provider",
  "provider_id",
  "provider_reference",
  "provider_result",
  "provider_payload",
  "didit_session_id",
  "verified_at",
  "verified_by",
  "verifier_name",
  "verifier_kind",
  "identity_verified_at",
  "kyc_verified_at",
  "aml_screened_at",
  "screened_at",
  "reviewed_at",
  "reviewed_by",
  "reviewer_id",
  "onboarding_state",
  "payment_status",
  "funding_status",
  "subscription_status",
  "executed_at",
  "signed_at",
  "signature_status",
  "bank_account_id",
  "account_number",
  "routing_number",
  "wire_instructions",
  "authority_level",
  "is_authorized_signer",
  "tax_id_reference",
  "tax_id_last4",
  "date_of_birth",
];

const PROTECTED = new Set(PROTECTED_FIELDS);

export function isProtectedField(field: string): boolean {
  return PROTECTED.has(field);
}

export interface SanitizedDraft {
  values: Record<string, unknown>;
}

/**
 * Keeps only allowlisted fields, and refuses the whole submission if it tries
 * to carry an authoritative field or an unknown one.
 */
export function sanitizeAssistedPayload(
  draftType: AssistedDraftType,
  payload: unknown,
): SanitizedDraft {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Nothing to prepare.");
  }
  const allowed = ASSISTED_FIELDS[draftType];
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (isProtectedField(key)) {
      throw new Error(`Forbidden: "${key}" can only be set by verification, never prepared.`);
    }
    if (!allowed.includes(key)) {
      throw new Error(`Forbidden: "${key}" cannot be prepared on your behalf.`);
    }
    if (value === undefined) continue;
    values[key] = value;
  }
  if (Object.keys(values).length === 0) throw new Error("Nothing to prepare.");
  return { values };
}

/** Where personal action is legally required, no preparation can substitute. */
export const CLIENT_ACTION_REQUIRED: Partial<Record<AssistedDraftType, string>> = {
  kyc_support:
    "Client action required — identity verification must be completed by the client in person.",
  kyb_support:
    "Client action required — the authorised person must confirm the entity check themselves.",
  accreditation:
    "Client action required — the client must attest to their accreditation; verification stays with Harmonious.",
  investment:
    "Client action required — the client must review, attest and sign in their own account.",
};

export const DRAFT_STATUS_LABELS: Record<string, string> = {
  awaiting_client_review: "Awaiting your review",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  withdrawn: "Withdrawn",
};
