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