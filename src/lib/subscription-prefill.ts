/**
 * Subscription Agreement questionnaire answers that come from records the
 * investor already completed (Verification, commitment, contact details).
 * Pure: the server computes the facts and re-applies these on every save.
 */
import type { TaxFormType } from "@/lib/onboarding-compliance-model";

export const PREFILL_KEYS = {
  name: "name_of_subscriber",
  amount: "subscription_amount",
  email: "email",
  phone: "phone",
  businessType: "for_persons_individuals_and_business_type_check_one",
  irsForm: "which_of_the_following_irs_form_applies_to_the_subscriber",
} as const;

export const IDENTITY_DOCS_KEY = "if_the_subscriber_answered_no_to_questions_2_or_3_above_the_";

const BUSINESS_TYPE: Record<string, string> = {
  individual: "Single Individual (one signatory required)",
  partnership: "Limited Partnership",
  llc: "Limited Liability Company",
  corporation: "Corporation",
  ira: "Individual Retirement Account (custodian or trustee must sign)",
  trust: "Trust (other than IRA) (trustee must sign)",
  retirement_plan: "Qualified Plan (other than IRA)",
};

/** Joint profiles stay investor-chosen: verification can't tell the ownership form. */
export function businessTypeFor(profileType: string | null | undefined): string | null {
  return BUSINESS_TYPE[String(profileType ?? "")] ?? null;
}

export function irsFormOptionFor(formType: TaxFormType | null | undefined): string | null {
  if (formType === "w9") return "W-9 (for Investors who are U.S. Persons)";
  if (formType === "w8ben") return "W-8BEN (for Individual Investors who are not a U.S. Person)";
  if (formType === "w8bene") return "W-8BENE";
  return null;
}

export function formatUsd(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null;
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export interface PrefillFacts {
  verifiedName: string | null;
  commitmentCents: number | null;
  email: string | null;
  phone: string | null;
  profileType: string | null;
  taxFormType: TaxFormType | null;
}

/** Keys that are locked for this investor, with the value (null = waiting on Verification). */
export function lockedAnswers(f: PrefillFacts): Record<string, string | null> {
  const out: Record<string, string | null> = {
    [PREFILL_KEYS.name]: f.verifiedName?.trim() || null,
    [PREFILL_KEYS.amount]: formatUsd(f.commitmentCents),
    [PREFILL_KEYS.email]: f.email?.trim() || null,
    [PREFILL_KEYS.phone]: f.phone?.trim() || null,
    [PREFILL_KEYS.irsForm]: irsFormOptionFor(f.taxFormType),
  };
  const bt = businessTypeFor(f.profileType);
  if (bt || f.profileType !== "joint") out[PREFILL_KEYS.businessType] = bt;
  return out;
}

/** Server-side: locked keys always win over whatever the browser sent. */
export function applyLocked(answers: Record<string, unknown>, locked: Record<string, string | null>, presentKeys: string[]) {
  const next = { ...answers };
  for (const k of presentKeys) {
    if (!(k in locked)) continue;
    const v = locked[k];
    if (v == null) delete next[k];
    else next[k] = v;
  }
  return next;
}

const isUS = (c: unknown) => ["US", "USA", "UNITED STATES"].includes(String(c ?? "").trim().toUpperCase());

/** Previously supplied facts for the exact investing party; never use the login account. */
export function suppliedInvestorAnswers(person: Record<string, unknown> | null, profile: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (key: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  };
  const individual = profile?.['profile_type'] === "individual";
  // Entities and joint accounts must use their own address, not their signer's.
  const source = individual ? { ...person, ...Object.fromEntries(Object.entries(profile ?? {}).filter(([, v]) => typeof v === "string" && v.trim())) } : profile;
  for (const key of ["address_line1", "address_line2", "city", "region", "postal_code", "country", "phone"]) add(key, source?.[key]);
  if (individual) {
    add("date_of_birth", person?.['date_of_birth']);
    add("citizenship", person?.['citizenship_country']);
    add("citizenship_country", person?.['citizenship_country']);
  }
  if (out['address_line1']) {
    out['subscriber_s_address_of_residence'] = ["address_line1", "address_line2", "city", "region", "postal_code", "country"].map((key) => out[key]).filter(Boolean).join(", ");
  }
  add("address_for_delivery_and_notices_if_different_from_above", source?.['mailing_address']);
  const details = profile?.['details'];
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const record = details as Record<string, unknown>;
    const kyc = record['kyc'];
    const values = kyc && typeof kyc === "object" && !Array.isArray(kyc) ? { ...record, ...kyc } : record;
    // Explicit safe facts only: no tax IDs, bank numbers, signatures or attestations.
    for (const key of ["formation_state", "formation_date", "control_person", "beneficial_owners", "trustees", "grantor", "custodian_name", "second_holder_name", "second_holder_dob"]) add(key, values[key]);
  }
  return out;
}

/** Fill gaps only; false and zero are real answers. Dirty blanks stay blank. */
export function fillMissingInvestorAnswers<T extends Record<string, unknown>>(saved: T, supplied: Record<string, unknown>, keys: string[], dirty: string[] = []): Record<string, unknown> {
  const next: Record<string, unknown> = { ...saved };
  for (const key of keys) {
    if (dirty.includes(key)) continue;
    const current = next[key];
    const value = supplied[key];
    if ((current == null || (typeof current === "string" && !current.trim())) && value != null && (typeof value !== "string" || value.trim())) next[key] = value;
  }
  return next;
}

/**
 * U.S. person for question 9, from Verification: individuals by citizenship
 * (verified ID's issuing country when citizenship isn't recorded); entities by
 * the country they were formed in. Null = Verification doesn't say.
 */
export function usPersonFromVerification(f: { isIndividual: boolean; citizenshipCountry?: string | null; documentCountry?: string | null; entityCountry?: string | null }): boolean | null {
  const c = f.isIndividual ? (f.citizenshipCountry || f.documentCountry) : f.entityCountry;
  if (!c || !String(c).trim()) return null;
  return isUS(c);
}
