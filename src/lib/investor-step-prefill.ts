import { suppliedInvestorAnswers } from "./subscription-prefill";
import type { TaxIntakeAnswers, TaxFormFill } from "./onboarding-intake-model";

/** Only exact-party factual fields travel forward; signatures and tax IDs never do. */
export function taxReviewDetails(person: Record<string, unknown> | null, profile: Record<string, unknown>, questionnaire: Record<string, unknown> = {}): Partial<TaxFormFill> {
  const facts = suppliedInvestorAnswers(person, profile);
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const individual = profile['profile_type'] === "individual";
  return {
    legalName: text(profile['legal_name']) ?? text(profile['display_label']) ?? text(questionnaire['name_of_subscriber']) ?? "",
    addressLine: [facts['address_line1'], facts['address_line2']].filter(Boolean).join(", ") || text(questionnaire['subscriber_s_address_of_residence']),
    cityStateZip: [facts['city'], facts['region'], facts['postal_code']].filter(Boolean).join(", ") || null,
    country: text(facts['country']) ?? (individual ? text(person?.['tax_residency_country']) ?? text(person?.['residence_country']) : null),
    dateOfBirth: individual ? text(person?.['date_of_birth']) : null,
  };
}

/** A determined W-9 route already answers the one U.S. intake question. */
export function taxIntakeDefaults(saved: TaxIntakeAnswers | null, formType: string | null): TaxIntakeAnswers {
  if (saved) return { ...saved };
  return formType === "w9" ? { usPerson: "yes" } : {};
}

/** Never navigate to a signing page before preparation finishes successfully. */
export async function prepareThenOpen(prepared: boolean, prepare: () => Promise<unknown>, open: () => void): Promise<void> {
  if (!prepared) await prepare();
  open();
}

export function taxPreviewMatches(reviewed: string | null, current: string): boolean {
  return reviewed !== null && reviewed === current;
}