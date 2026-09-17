/**
 * Client-safe vocabulary for the professional workspace (Phase 3A).
 *
 * Only viewing capabilities are activated in this phase. Assist, signing and
 * transaction capabilities exist in the model but are never offered here.
 */
import type { DelegationCapability } from "@/lib/delegation-model";

export const PHASE_3A_CAPABILITIES: DelegationCapability[] = [
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
];

/**
 * Defined, but not grantable: these need the signed-authority workflow that
 * does not exist yet. The server refuses them even on an old delegation.
 */
export const SENSITIVE_CAPABILITIES: DelegationCapability[] = [
  "view_banking_info",
  "view_wire_instructions",
];

/** Phase 3B — preparing and assisting. Never deciding, signing or paying. */
export const PHASE_3B_CAPABILITIES: DelegationCapability[] = [
  "edit_profile_info",
  "prepare_investment",
  "upload_documents",
  "assist_kyc",
  "assist_kyb",
  "assist_accreditation",
];

/** Everything a client can actually grant today. */
export const ACTIVATED_CAPABILITIES: DelegationCapability[] = [
  ...PHASE_3A_CAPABILITIES.filter((c) => !SENSITIVE_CAPABILITIES.includes(c)),
  ...PHASE_3B_CAPABILITIES,
];

/** Selected by default in the grant wizard. */
export const DEFAULT_CAPABILITIES: DelegationCapability[] = ["view_profile", "view_investments"];


export const CAPABILITY_LABELS: Record<string, string> = {
  view_profile: "Personal and profile details",
  view_investments: "Investments and commitments",
  view_documents: "Investment documents",
  view_tax_documents: "Tax documents",
  view_financial_statements: "Capital account statements",
  view_compliance_status: "Verification status (summary only)",
  view_capital_calls: "Capital calls",
  view_distributions: "Distributions",
  view_banking_info: "Banking summary (last four digits only)",
  view_wire_instructions: "Wire instructions",
  edit_profile_info: "Prepare contact, entity and ownership details",
  prepare_investment: "Prepare an investment for your review",
  upload_documents: "Upload supporting documents",
  assist_kyc: "Help assemble identity-check information",
  assist_kyb: "Help assemble entity-check information",
  assist_accreditation: "Prepare accreditation information",
};


export const SCOPE_LABELS: Record<string, string> = {
  person: "Everything for this client",
  investment_profile: "One investment profile",
  fund: "One fund",
  investment: "One investment",
  data_category: "One category of information",
};

export const AUTHORITY_LABELS: Record<string, string> = {
  view: "View only",
  assist: "Assist",
  limited_proxy: "Limited proxy",
  authorized_signatory: "Authorised signatory",
  transaction_authority: "Transaction authority",
};
