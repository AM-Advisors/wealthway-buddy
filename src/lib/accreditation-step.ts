/** Maps the questionnaire's accredited-investor answer to a self-certification basis. Pure. */
export const ACCREDITATION_QUESTION_KEY = "please_select_the_accreditation_that_applies_to_you";

export type AccreditationBasis = "income" | "net_worth" | "professional_certification" | "entity_assets" | "knowledgeable_employee";

export function basisFromAnswer(answer: unknown): AccreditationBasis | null {
  const a = String(answer ?? "").toLowerCase();
  if (!a.trim()) return null;
  if (a.startsWith("net worth")) return "net_worth";
  if (a.startsWith("income")) return "income";
  if (a.includes("series 7") || a.startsWith("investment advisers")) return "professional_certification";
  if (a.includes("knowledgeable employees") || a.startsWith("directors, executive officers")) return "knowledgeable_employee";
  return "entity_assets";
}

/** Verified-accreditation offerings (506(c)) never accept a self-certification. */
export function selfCertificationAllowed(exemption: string | null | undefined): boolean {
  return !String(exemption ?? "").toLowerCase().includes("506c") && !String(exemption ?? "").toLowerCase().includes("506(c)");
}

/** Accreditation that is already done (or under review) needs nothing from the investor. */
export function accreditationStepDone(state: string | null | undefined): boolean {
  return state === "valid" || state === "not_applicable" || state === "review_required";
}
