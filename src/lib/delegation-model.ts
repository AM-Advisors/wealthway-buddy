/**
 * Canonical delegation vocabulary.
 *
 * Everything a professional can be authorized to do is one of these typed
 * capabilities. Strings that are not on this list can never evaluate as
 * allowed: the permission model is deny-by-default by construction.
 */

export const AUTHORITY_LEVELS = [
  "view",
  "assist",
  "limited_proxy",
  "authorized_signatory",
  "transaction_authority",
] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

/** Ceiling ordering. A higher level never *grants* anything on its own. */
const AUTHORITY_RANK: Record<AuthorityLevel, number> = {
  view: 0,
  assist: 1,
  limited_proxy: 2,
  authorized_signatory: 3,
  transaction_authority: 4,
};

export const DELEGATION_CAPABILITIES = [
  "view_profile",
  "edit_profile_info",
  "view_investments",
  "prepare_investment",
  "initiate_investment",
  "view_documents",
  "upload_documents",
  "view_tax_documents",
  "view_financial_statements",
  "view_compliance_status",
  "assist_kyc",
  "assist_kyb",
  "assist_accreditation",
  "view_capital_calls",
  "view_distributions",
  "view_banking_info",
  "view_wire_instructions",
  "sign_specified_documents",
  "approve_specified_actions",
] as const;
export type DelegationCapability = (typeof DELEGATION_CAPABILITIES)[number];

/** Minimum authority level required before a capability may be exercised. */
export const CAPABILITY_MIN_AUTHORITY: Record<DelegationCapability, AuthorityLevel> = {
  view_profile: "view",
  view_investments: "view",
  view_documents: "view",
  view_tax_documents: "view",
  view_financial_statements: "view",
  view_compliance_status: "view",
  view_capital_calls: "view",
  view_distributions: "view",
  edit_profile_info: "assist",
  upload_documents: "assist",
  prepare_investment: "assist",
  assist_kyc: "assist",
  assist_kyb: "assist",
  assist_accreditation: "assist",
  approve_specified_actions: "limited_proxy",
  view_banking_info: "limited_proxy",
  sign_specified_documents: "authorized_signatory",
  initiate_investment: "transaction_authority",
  view_wire_instructions: "transaction_authority",
};

/** Capabilities that only ever read. Never usable for a mutation. */
export const READ_ONLY_CAPABILITIES: ReadonlySet<DelegationCapability> = new Set([
  "view_profile",
  "view_investments",
  "view_documents",
  "view_tax_documents",
  "view_financial_statements",
  "view_compliance_status",
  "view_capital_calls",
  "view_distributions",
  "view_banking_info",
  "view_wire_instructions",
]);

export const SCOPE_TYPES = [
  "person",
  "investment_profile",
  "fund",
  "investment",
  "data_category",
] as const;
export type DelegationScopeType = (typeof SCOPE_TYPES)[number];

export const PROFESSIONAL_ORG_TYPES = [
  "investment_adviser",
  "broker_dealer",
  "law_firm",
  "accounting_firm",
  "family_office",
  "wealth_manager",
  "tax_advisor",
  "trustee_fiduciary",
  "custodian",
  "consultant",
  "fund_manager_gp",
  "administrator",
  "placement_agent",
  "other",
] as const;
export type ProfessionalOrgType = (typeof PROFESSIONAL_ORG_TYPES)[number];

export const MEMBERSHIP_STATUSES = ["invited", "active", "suspended", "removed"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export function isDelegationCapability(value: unknown): value is DelegationCapability {
  return (
    typeof value === "string" &&
    (DELEGATION_CAPABILITIES as readonly string[]).includes(value)
  );
}

export function isAuthorityLevel(value: unknown): value is AuthorityLevel {
  return typeof value === "string" && (AUTHORITY_LEVELS as readonly string[]).includes(value);
}

/** True when `level` reaches at least `required`. */
export function authorityAtLeast(level: AuthorityLevel, required: AuthorityLevel): boolean {
  return AUTHORITY_RANK[level] >= AUTHORITY_RANK[required];
}

/**
 * A capability is only exercisable when it is explicitly granted AND the
 * delegation's authority ceiling reaches the level that capability requires.
 * Authority alone authorizes nothing.
 */
export function capabilityAllowedAtAuthority(
  capability: DelegationCapability,
  level: AuthorityLevel,
): boolean {
  return authorityAtLeast(level, CAPABILITY_MIN_AUTHORITY[capability]);
}

export function isMutatingCapability(capability: DelegationCapability): boolean {
  return !READ_ONLY_CAPABILITIES.has(capability);
}
