import { isEntityProfileType, isInvestmentProfileType } from "./identity-model";
import type { RequirementResult } from "./investor-onboarding-model";

export const PROFILE_DOCUMENT_KINDS = [
  { value: "identification", label: "Government ID" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "accreditation_proof", label: "Accreditation evidence" },
  { value: "entity_formation", label: "Formation document" },
  { value: "operating_agreement", label: "Operating or trust agreement" },
  { value: "ownership_list", label: "Owners and signers list" },
  { value: "tax_form", label: "Tax form" },
] as const;
export type ProfileDocumentKind = (typeof PROFILE_DOCUMENT_KINDS)[number]["value"];
export type ProfileDocumentEvidence = { kind: string; status: string };

/** Collection only: an upload never establishes KYC, tax or accreditation approval. */
export function profileDocumentRequirements(type: string | null, requirements: RequirementResult[], evidence: ProfileDocumentEvidence[], accreditationMethod?: string | null) {
  if (!isInvestmentProfileType(type)) return [];
  const state = (key: string) => requirements.find((r) => r.key === key)?.state;
  const applies = (key: string) => state(key) != null && state(key) !== "not_applicable";
  const kinds: ProfileDocumentKind[] = [];
  if (isEntityProfileType(type) && applies("entity_verification")) {
    if (type !== "trust") kinds.push("entity_formation");
    if (["llc", "partnership", "trust"].includes(type)) kinds.push("operating_agreement");
    if (applies("beneficial_owners")) kinds.push("ownership_list");
  }
  // ID images stay with the identity-check provider, and tax forms use the official signing flow.
  if (applies("accreditation") && accreditationMethod !== "self_certification") kinds.push("accreditation_proof");
  return kinds.map((kind) => {
    const row = evidence.find((e) => e.kind === kind);
    const canonical = kind === "accreditation_proof" ? state("accreditation") === "valid" : state("entity_verification") === "valid";
    const received = !!row && !["rejected", "needs_followup"].includes(row.status);
    return { kind, label: PROFILE_DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? kind, received: received || canonical, status: row?.status ?? (canonical ? "on_file" : "missing") };
  });
}

export function reusableProfileAccreditation(rows: any[], offeringId: string) {
  return rows.find((r) => r.offering_id === offeringId) ?? rows.find((r) => r.offering_id == null) ?? null;
}