/**
 * Phase 2 vocabulary: the canonical person, the onboarding state machine and
 * the investment-profile model.
 *
 * Everything here is deny-by-default and closed: a value that is not on one of
 * these lists never evaluates as valid, verified or ready.
 */

export const ONBOARDING_STATES = [
  "account_created",
  "profile_required",
  "identity_required",
  "kyc_pending",
  "aml_pending",
  "verified",
  "review_required",
  "failed",
  "reverification_required",
] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];

/** Only these moves are legal. Anything else is refused server-side. */
export const ONBOARDING_TRANSITIONS: Record<OnboardingState, readonly OnboardingState[]> = {
  account_created: ["profile_required", "review_required", "failed"],
  profile_required: ["identity_required", "review_required", "failed"],
  identity_required: ["kyc_pending", "review_required", "failed"],
  kyc_pending: ["aml_pending", "review_required", "failed"],
  aml_pending: ["verified", "review_required", "failed"],
  review_required: ["kyc_pending", "aml_pending", "verified", "failed"],
  verified: ["reverification_required", "review_required", "failed"],
  reverification_required: ["identity_required", "kyc_pending", "review_required", "failed"],
  failed: ["identity_required", "review_required"],
};

export function isOnboardingState(value: unknown): value is OnboardingState {
  return typeof value === "string" && (ONBOARDING_STATES as readonly string[]).includes(value);
}

export function canTransition(from: unknown, to: unknown): boolean {
  if (!isOnboardingState(from) || !isOnboardingState(to)) return false;
  return ONBOARDING_TRANSITIONS[from].includes(to);
}

/** States in which an external person may reach protected investor data. */
export const ONBOARDING_PASS_STATES: ReadonlySet<OnboardingState> = new Set<OnboardingState>([
  "verified",
]);

export const INVESTMENT_PROFILE_TYPES = [
  "individual",
  "joint",
  "llc",
  "corporation",
  "partnership",
  "trust",
  "ira",
  "family_office",
  "foundation",
  "other_entity",
] as const;
export type InvestmentProfileType = (typeof INVESTMENT_PROFILE_TYPES)[number];

export const INVESTMENT_PROFILE_LABELS: Record<InvestmentProfileType, string> = {
  individual: "Individual",
  joint: "Joint",
  llc: "LLC",
  corporation: "Corporation",
  partnership: "Partnership",
  trust: "Trust",
  ira: "IRA / retirement account",
  family_office: "Family office",
  foundation: "Foundation / nonprofit",
  other_entity: "Other entity",
};

/** Profile types that are a legal entity in their own right and need KYB. */
export const ENTITY_PROFILE_TYPES: ReadonlySet<InvestmentProfileType> = new Set<
  InvestmentProfileType
>(["llc", "corporation", "partnership", "trust", "family_office", "foundation", "other_entity"]);

export function isEntityProfileType(type: unknown): boolean {
  return (
    typeof type === "string" && ENTITY_PROFILE_TYPES.has(type as InvestmentProfileType)
  );
}

export function isInvestmentProfileType(value: unknown): value is InvestmentProfileType {
  return (
    typeof value === "string" && (INVESTMENT_PROFILE_TYPES as readonly string[]).includes(value)
  );
}

export const PROFILE_RELATIONSHIP_ROLES = [
  "owner",
  "beneficial_owner",
  "control_person",
  "manager",
  "member",
  "officer",
  "director",
  "trustee",
  "grantor",
  "authorized_signer",
  "joint_owner",
  "beneficiary",
] as const;
export type ProfileRelationshipRole = (typeof PROFILE_RELATIONSHIP_ROLES)[number];

export function isProfileRelationshipRole(value: unknown): value is ProfileRelationshipRole {
  return (
    typeof value === "string" &&
    (PROFILE_RELATIONSHIP_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Related people whose own identity must be verified before an entity profile
 * can invest. Passive roles (member, beneficiary) are not gating.
 */
export const GATING_RELATIONSHIP_ROLES: ReadonlySet<ProfileRelationshipRole> = new Set<
  ProfileRelationshipRole
>(["control_person", "trustee", "authorized_signer", "beneficial_owner", "joint_owner"]);

/** Verification states a browser client may never write. */
export const PROVIDER_OWNED_FIELDS = [
  "kyc_status",
  "aml_status",
  "kyb_status",
  "entity_aml_status",
  "verification_status",
  "verified_at",
  "verified_by",
  "reviewer_id",
  "status",
  "tax_id_reference",
] as const;

export type ReadinessCode =
  | "person_kyc_required"
  | "person_kyc_pending"
  | "person_aml_required"
  | "person_aml_pending"
  | "onboarding_incomplete"
  | "kyb_required"
  | "kyb_pending"
  | "entity_aml_pending"
  | "related_person_kyc_required"
  | "accreditation_required"
  | "accreditation_pending"
  | "accreditation_expired"
  | "profile_not_found"
  | "offering_not_found"
  | "not_your_profile";

export interface ReadinessReason {
  code: ReadinessCode;
  message: string;
}

export interface ReadinessResult {
  ready: boolean;
  profileId: string;
  offeringId: string;
  reasons: ReadinessReason[];
}
