/** Maps the questionnaire's accredited-investor answer to a self-certification basis. Pure. */
import { EVIDENCE_OPTIONS, type EvidenceMethod, type EvidenceOption } from "@/lib/accreditation-evidence-options";

export const ACCREDITATION_QUESTION_KEY = "please_select_the_accreditation_that_applies_to_you";

export type AccreditationBasis = "income" | "net_worth" | "professional_certification" | "entity_assets" | "knowledgeable_employee";

/** The accreditation category question is asked in the Accreditation section, not the questionnaire form. */
export function isAccreditationQuestion(key: string): boolean {
  return key === ACCREDITATION_QUESTION_KEY;
}

/** Evidence that can prove each basis on a verified (506(c)) offering. A professional letter always works. */
export function evidenceForBasis(basis: AccreditationBasis | null): EvidenceOption[] {
  const primary: Record<AccreditationBasis, EvidenceMethod[]> = {
    income: ["income_documents"],
    net_worth: ["net_worth_documents"],
    professional_certification: ["professional_license"],
    entity_assets: ["entity_documents"],
    knowledgeable_employee: [],
  };
  const methods = basis ? primary[basis] : [];
  return EVIDENCE_OPTIONS.filter((o) => methods.includes(o.method) || o.method === "third_party_letter");
}

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

/** 506(b): the investor's confirmation completes accreditation. 506(c): paperwork waits for the fund manager or Harmonious. */
export function accreditationOutcome(exemption: string | null | undefined): "approved" | "review" {
  return selfCertificationAllowed(exemption) ? "approved" : "review";
}
