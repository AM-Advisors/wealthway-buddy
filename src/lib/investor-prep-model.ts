/** Pure rules for preparing an investor's onboarding package before it is sent. */

export type PreparerCapacity = "fund_manager" | "harmonious";
export type FieldState = "prepared" | "investor_confirmed" | "provider_verified" | "harmonious_approved";
export type DocRequirement = "required" | "optional" | "investor_specific";
export type SigningMode = "investor_only" | "investor_then_manager" | "acknowledgement" | "none";

export const PREPARABLE_FIELDS = [
  "legal_name", "display_name", "email", "commitment_cents", "profile_type", "entity_name",
  "phone", "address", "ownership_title", "authorized_signer_name", "expected_funding_cents",
  "side_letter", "external_reference", "tax_classification", "control_person",
] as const;
export type PreparableField = (typeof PREPARABLE_FIELDS)[number];

/** Things only the investor, a provider or Harmonious review may establish. */
export const FORBIDDEN_PREP_KEYS = [
  "kyc_status", "kyc_approved", "aml_status", "aml_approved", "sanctions_passed", "sanctions_status",
  "accreditation_certified", "accreditation_status", "w9_certified", "w8_certified", "tax_form_certified",
  "bad_actor_answers", "bad_actor_certified", "certifications_accepted", "investor_signature", "signed_as_investor",
  "funds_received", "funded", "funding_status",
] as const;

export const MATERIAL_FIELDS: PreparableField[] = [
  "legal_name", "entity_name", "control_person", "commitment_cents", "tax_classification", "profile_type",
];

export const RELATED_ROLES_BY_PROFILE: Record<string, string[]> = {
  trust: ["trustee"],
  llc: ["beneficial_owner", "control_person", "authorized_signer"],
  entity: ["beneficial_owner", "control_person", "authorized_signer"],
  corporation: ["beneficial_owner", "control_person", "authorized_signer"],
  partnership: ["general_partner", "beneficial_owner", "authorized_signer"],
  ira: ["account_owner", "custodian_signer"],
  retirement_plan: ["plan_trustee", "authorized_signer"],
};

export type PreparedField = { value: unknown; state: FieldState; source: PreparerCapacity | "investor" };

export function preparedLabel(c: PreparerCapacity) {
  return c === "harmonious" ? "Prepared by Harmonious" : "Prepared by Fund Manager";
}

/** Reject any attempt by a preparer to set compliance/funding facts or unknown fields. */
export function validatePrepFields(fields: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  for (const k of Object.keys(fields)) {
    if ((FORBIDDEN_PREP_KEYS as readonly string[]).includes(k)) {
      return { ok: false, error: `“${k}” can only come from the investor, a verification provider or Harmonious review.` };
    }
    if (!(PREPARABLE_FIELDS as readonly string[]).includes(k)) return { ok: false, error: `Unknown field “${k}”.` };
  }
  return { ok: true };
}

/** Prepared values always start as "prepared" — never investor-certified. */
export function toPreparedFields(fields: Record<string, unknown>, by: PreparerCapacity): Record<string, PreparedField> {
  const out: Record<string, PreparedField> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") out[k] = { value: v, state: "prepared", source: by };
  return out;
}

/** Investor confirms or corrects a prepared field. Returns whether requirements must be recomputed. */
export function applyInvestorReview(
  current: Record<string, PreparedField>,
  key: PreparableField,
  action: { confirm: true } | { correct: unknown },
): { fields: Record<string, PreparedField>; recompute: boolean } {
  const prev = current[key];
  if ("confirm" in action) {
    if (!prev) return { fields: current, recompute: false };
    return { fields: { ...current, [key]: { ...prev, state: "investor_confirmed" } }, recompute: false };
  }
  const changed = !prev || JSON.stringify(prev.value) !== JSON.stringify(action.correct);
  return {
    fields: { ...current, [key]: { value: action.correct, state: "investor_confirmed", source: "investor" } },
    recompute: changed && MATERIAL_FIELDS.includes(key),
  };
}

export type FundDocument = {
  id: string; offering_id: string; title: string; investor_required: boolean;
  requires_signature: boolean; signing_mode: string; template_ready: boolean;
};
export type SelectedDoc = { documentId: string; requirement: DocRequirement };

export function signingModeOf(d: FundDocument): SigningMode {
  if (!d.requires_signature) return d.signing_mode === "acknowledgement" ? "acknowledgement" : "none";
  return d.signing_mode === "investor_then_manager" || d.signing_mode === "countersign" ? "investor_then_manager" : "investor_only";
}

export function defaultDocuments(docs: FundDocument[]): SelectedDoc[] {
  return docs.filter((d) => d.investor_required).map((d) => ({ documentId: d.id, requirement: "required" }));
}

/** Enforces fund scope and mandatory documents. */
export function reconcileDocuments(
  offeringId: string, docs: FundDocument[], requested: SelectedDoc[],
): { ok: true; selected: SelectedDoc[] } | { ok: false; error: string } {
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const r of requested) {
    const d = byId.get(r.documentId);
    if (!d || d.offering_id !== offeringId) return { ok: false, error: "That document doesn't belong to this fund." };
  }
  const selected: SelectedDoc[] = [];
  const seen = new Set<string>();
  for (const d of docs.filter((x) => x.investor_required)) { selected.push({ documentId: d.id, requirement: "required" }); seen.add(d.id); }
  for (const r of requested) {
    if (seen.has(r.documentId)) continue;
    seen.add(r.documentId);
    selected.push({ documentId: r.documentId, requirement: r.requirement === "required" ? "optional" : r.requirement });
  }
  return { ok: true, selected };
}

export function sendBlockers(input: { email?: string | null; docs: FundDocument[]; selected: SelectedDoc[] }): string[] {
  const out: string[] = [];
  if (!input.email || !/.+@.+\..+/.test(input.email)) out.push("A valid investor email is required.");
  const byId = new Map(input.docs.map((d) => [d.id, d]));
  for (const s of input.selected) {
    const d = byId.get(s.documentId);
    if (d && d.requires_signature && !d.template_ready) out.push(`The signing template for “${d.title}” isn't ready.`);
  }
  return out;
}

/** Merge values come from the profile/prepared data; documents never feed back into the profile. */
export function mergeFields(
  fields: Record<string, PreparedField>, fund: { name: string }, effectiveDate: string,
): Record<string, string> {
  const v = (k: string) => (fields[k]?.value == null ? "" : String(fields[k]!.value));
  const cents = Number(fields["commitment_cents"]?.value ?? 0);
  return {
    investor_legal_name: v("legal_name") || v("display_name"),
    entity_name: v("entity_name"),
    commitment_amount: cents ? `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "",
    address: v("address"),
    ownership_title: v("ownership_title"),
    signatory: v("authorized_signer_name") || v("legal_name"),
    fund_name: fund.name,
    effective_date: effectiveDate,
  };
}
