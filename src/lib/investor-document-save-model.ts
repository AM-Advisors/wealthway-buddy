/**
 * Where a document read with AI is saved on the investor's record, and the existing step
 * that can then put it to use. Saving never decides anything; each use is a separate,
 * explicit action through the existing review engines.
 */
export const SAVE_TARGETS = [
  { key: "tax_form", label: "Signed W-9 or W-8", store: "upload", use: "tax_outside" },
  { key: "accreditation_proof", label: "Accreditation proof", store: "upload", use: "accept_accreditation" },
  { key: "identification", label: "Government ID", store: "upload", use: null },
  { key: "proof_of_address", label: "Proof of address", store: "upload", use: "accept_copy" },
  { key: "entity_formation", label: "Entity formation document", store: "upload", use: "accept_copy" },
  { key: "operating_agreement", label: "Entity operating or trust agreement", store: "upload", use: "accept_copy" },
  { key: "ownership_list", label: "Ownership list", store: "upload", use: "accept_copy" },
  { key: "subscription_agreement", label: "Signed subscription agreement", store: "prior", use: "subscription_outside" },
  { key: "side_letter", label: "Signed side letter", store: "prior", use: null },
  { key: "other", label: "Other signed document", store: "prior", use: null },
] as const;
export type SaveTargetKey = (typeof SAVE_TARGETS)[number]["key"];
export type SaveUse = (typeof SAVE_TARGETS)[number]["use"];
export const saveTarget = (k: string) => SAVE_TARGETS.find((t) => t.key === k) ?? null;

export const USE_LABEL: Record<NonNullable<SaveUse>, string> = {
  tax_outside: "Use as the investor's tax form",
  accept_accreditation: "Approve as accreditation proof",
  accept_copy: "Accept this copy",
  subscription_outside: "Mark subscription signed outside the platform",
};

/** Best guess from the AI's document label; null means a person picks. */
export function guessSaveTarget(documentKind: string): SaveTargetKey | null {
  const k = documentKind.toLowerCase();
  if (/\bw-?9\b|\bw-?8|tax form/.test(k)) return "tax_form";
  if (/accredit|cpa letter|attorney letter|verification letter/.test(k)) return "accreditation_proof";
  if (/subscription/.test(k)) return "subscription_agreement";
  if (/side letter/.test(k)) return "side_letter";
  if (/passport|driver|license|government id|\bid card\b|identification/.test(k)) return "identification";
  if (/utility|proof of address|address/.test(k)) return "proof_of_address";
  if (/certificate of (formation|incorporation)|articles|formation|trust certificate/.test(k)) return "entity_formation";
  if (/operating agreement|trust agreement|partnership agreement|bylaws/.test(k)) return "operating_agreement";
  if (/ownership|beneficial owner|cap table/.test(k)) return "ownership_list";
  return null;
}
