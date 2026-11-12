/**
 * What the investor's own profile shows for tax details, read from the canonical
 * records Harmonious already keeps: the person first, then the person's own
 * individual investment profile and its tax profile, plus any recorded tax form.
 * Display only: never writes, never certifies, never reads entity profiles.
 */
export type TaxPerson = { tax_residency_country?: string | null; tax_id_last4?: string | null; tax_id_on_file?: boolean | null };
export type TaxIndividualProfile = { id: string; profile_type: string; tax_id_last4?: string | null; tax_id_type?: string | null };
export type TaxProfileRow = { investment_profile_id: string | null; tax_residency_country: string | null; tin_on_file?: boolean | null };
export type TaxFormRow = { investment_profile_id: string | null; review_status: string | null; uploaded_at?: string | null };

export type ProfileTaxSummary = {
  residency: string | null;
  residencySource: "person" | "individual_profile" | null;
  identifierOnFile: boolean;
  identifierLast4: string | null;
  identifierType: string | null;
  identifierSource: "person" | "individual_profile" | null;
  taxForm: "completed_outside" | "accepted" | "review_pending" | null;
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function profileTaxSummary(input: {
  person: TaxPerson | null;
  profiles: TaxIndividualProfile[];
  taxProfiles: TaxProfileRow[];
  taxForms: TaxFormRow[];
}): ProfileTaxSummary {
  const own = input.profiles.filter((p) => p.profile_type === "individual");
  const ownIds = new Set(own.map((p) => p.id));
  const personResidency = text(input.person?.tax_residency_country);
  const profileResidency = input.taxProfiles
    .filter((t) => t.investment_profile_id && ownIds.has(t.investment_profile_id))
    .map((t) => text(t.tax_residency_country))
    .find(Boolean) ?? null;

  const personLast4 = text(input.person?.tax_id_last4);
  const personOnFile = Boolean(input.person?.tax_id_on_file || personLast4);
  const profileWithId = own.find((p) => text(p.tax_id_last4));

  const forms = input.taxForms.filter((f) => f.investment_profile_id && ownIds.has(f.investment_profile_id));
  const has = (s: string) => forms.some((f) => (f.review_status ?? "new") === s);
  const taxForm = has("completed_outside") ? "completed_outside" : has("accepted") ? "accepted" : has("new") ? "review_pending" : null;

  return {
    residency: personResidency ?? profileResidency,
    residencySource: personResidency ? "person" : profileResidency ? "individual_profile" : null,
    identifierOnFile: personOnFile || Boolean(profileWithId),
    identifierLast4: personLast4 ?? text(profileWithId?.tax_id_last4),
    identifierType: personOnFile ? null : text(profileWithId?.tax_id_type),
    identifierSource: personOnFile ? "person" : profileWithId ? "individual_profile" : null,
    taxForm,
  };
}

export const TAX_FORM_LABEL: Record<NonNullable<ProfileTaxSummary["taxForm"]>, string> = {
  completed_outside: "Signed tax form on file (completed outside the platform)",
  accepted: "Tax form copy on file",
  review_pending: "Tax form uploaded, Harmonious review pending",
};

/** Only fields actually submitted are saved, so a short form never erases other details. */
export function submittedFields<T extends Record<string, unknown>>(data: T, keys: readonly (keyof T)[]): Partial<Record<keyof T, string | null>> {
  const out: Partial<Record<keyof T, string | null>> = {};
  for (const k of keys) {
    if (data[k] === undefined) continue;
    const v = data[k];
    out[k] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  return out;
}
