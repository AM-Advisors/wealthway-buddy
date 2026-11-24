/**
 * What an entity / trust investor record still needs: the entity itself (legal
 * name, EIN, responsible party) and each owner, control person and signer
 * (name, email, date of birth, SSN), plus one signer assigned to the W-9.
 * Pure projection over booleans; it never reads or returns protected values.
 */
export type RequirementPerson = {
  id: string; name: string; role: string; ownershipPercent: number | null; signer: boolean;
  email: string | null; dobOnFile: boolean; ssnOnFile: boolean; taxFormSigner?: boolean;
};
export type EntityRequirementInput = {
  legalName: string | null; einOnFile: boolean; responsiblePartyId: string | null; people: RequirementPerson[];
};
export type RequirementItem = { key: string; label: string; done: boolean; personId?: string };

/** Owners at 25%+ (or unknown share), control persons, trustees and signers need full details. */
export function needsFullDetails(p: Pick<RequirementPerson, "role" | "ownershipPercent" | "signer">): boolean {
  if (p.signer || ["control_person", "trustee", "authorized_signer", "officer", "manager"].includes(p.role)) return true;
  if (["beneficial_owner", "owner", "member", "joint_owner"].includes(p.role)) return p.ownershipPercent == null || p.ownershipPercent >= 25;
  return false;
}

export function missingPersonFields(p: RequirementPerson): string[] {
  if (!needsFullDetails(p)) return [];
  const out: string[] = [];
  if (!p.name.trim()) out.push("name");
  if (!p.email?.trim()) out.push("email");
  if (!p.dobOnFile) out.push("date of birth");
  if (!p.ssnOnFile) out.push("SSN");
  return out;
}

export function entityRequirements(input: EntityRequirementInput): RequirementItem[] {
  const signers = input.people.filter((p) => p.signer);
  const items: RequirementItem[] = [
    { key: "legal_name", label: "Entity legal name", done: Boolean(input.legalName?.trim()) },
    { key: "ein", label: "EIN", done: input.einOnFile },
    { key: "responsible_party", label: "Responsible party chosen", done: Boolean(input.responsiblePartyId && input.people.some((p) => p.id === input.responsiblePartyId)) },
    { key: "control_person", label: "At least one control person, trustee or officer", done: input.people.some((p) => ["control_person", "trustee", "officer", "manager"].includes(p.role)) },
    { key: "signer", label: "At least one signer", done: signers.length > 0 },
    { key: "w9_signer", label: "W-9 signer assigned", done: signers.some((p) => p.taxFormSigner) },
  ];
  for (const p of input.people) {
    const missing = missingPersonFields(p);
    if (needsFullDetails(p)) items.push({ key: `person:${p.id}`, label: missing.length ? `${p.name || "Person"}: add ${missing.join(", ")}` : `${p.name}: details complete`, done: missing.length === 0, personId: p.id });
  }
  return items;
}
