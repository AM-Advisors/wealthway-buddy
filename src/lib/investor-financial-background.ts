import { isIndividualProfile, type AmlFacts, type AmlAnswers, type AmlField } from "./onboarding-intake-model";

/** Exact investing-party facts only; entity questionnaires never inherit signer citizenship. */
export function financialBackgroundKnown(person: Record<string, unknown> | null, profile: Record<string, unknown>, questionnaire: Record<string, unknown> = {}): AmlFacts["known"] {
  const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
  const individual = isIndividualProfile(String(profile['profile_type'] ?? ""));
  return {
    citizenship: individual ? text(person?.['citizenship_country']) ?? text(questionnaire['citizenship_country']) : null,
    residence: individual ? text(person?.['residence_country']) ?? text(person?.['country']) ?? text(profile['country']) : text(profile['country']),
    occupation: individual ? text(questionnaire['occupation']) : null,
    businessNature: individual ? null : text(questionnaire['business_nature']),
  };
}

/** Conditional follow-ups appear before save, without inventing any risk decision. */
export function financialBackgroundFields(base: AmlField[], answers: Partial<AmlAnswers>): AmlField[] {
  const fields = [...base].filter(f => f !== "sourceOfFundsDetail" || answers.sourceOfFunds === "other");
  if (answers.sourceOfFunds === "other" && !fields.includes("sourceOfFundsDetail")) fields.splice(fields.indexOf("sourceOfFunds") + 1, 0, "sourceOfFundsDetail");
  if (answers.politicallyExposed === "yes") {
    for (const field of ["sourceOfWealth", "sourceOfWealthDetail"] as const) if (!fields.includes(field)) fields.push(field);
  }
  return fields;
}
/**
 * Citizenship the investor certified in the financial background questions,
 * to fill a blank citizenship on their own person record. Individuals only
 * (a joint or entity answer is not one person's fact); never overwrites a
 * value that is already recorded.
 */
export function citizenshipToRecord(input: { profileType: string | null | undefined; current: unknown; answer: unknown }): string | null {
  if (String(input.profileType ?? "") !== "individual") return null;
  if (typeof input.current === "string" && input.current.trim()) return null;
  const a = typeof input.answer === "string" ? input.answer.trim() : "";
  return a ? a.slice(0, 60) : null;
}

/**
 * Financial facts the same investing profile gave for an earlier investment,
 * used as editable starting answers. Per-investment statements (third-party
 * funding, politically exposed, expected activity) are always asked again,
 * and the investor still confirms everything with their typed name.
 */
export const REUSABLE_FINANCIAL_FACTS = [
  "citizenship", "residence", "occupation", "businessNature",
  "sourceOfFunds", "sourceOfFundsDetail", "fundsOriginCountry", "sourceOfWealth", "sourceOfWealthDetail",
] as const;

export function priorFinancialFacts(prior: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of REUSABLE_FINANCIAL_FACTS) {
    const v = prior?.[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}
