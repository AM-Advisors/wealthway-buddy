/** Pure: turn AI-read document values into a new-investor draft. Never carries tax/account numbers. */
export type DocValues = Record<string, string | null | undefined>;
export type DocName = { name: string; role: string };
export type NewInvestorDraft = {
  type: "individual" | "entity" | "trust";
  firstName: string; middleName: string; lastName: string; email: string; legalName: string;
  phone: string; dateOfBirth: string; citizenship: string;
  addressLine1: string; addressLine2: string; city: string; region: string; postalCode: string; country: string;
};
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function draftFromDocument(values: DocValues, names: DocName[]): NewInvestorDraft {
  let first = s(values["first_name"]), last = s(values["last_name"]);
  const entity = s(values["investing_entity_legal_name"]) || names.find((n) => n.role === "entity")?.name.trim() || "";
  if (!first && !last) {
    const p = names.find((n) => n.role === "person") ?? names.find((n) => n.role === "signer");
    const parts = (p?.name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length) { first = parts[0]!; last = parts.slice(1).join(" "); }
  }
  const type = entity ? (/\btrust\b/i.test(entity) ? "trust" : "entity") : "individual";
  return {
    type, firstName: first, middleName: s(values["middle_name"]), lastName: last, email: s(values["email"]).toLowerCase(), legalName: entity,
    phone: s(values["phone"]), dateOfBirth: s(values["date_of_birth"]), citizenship: s(values["citizenship_country"]),
    addressLine1: s(values["address_line1"]), addressLine2: s(values["address_line2"]), city: s(values["city"]), region: s(values["region"]),
    postalCode: s(values["postal_code"]), country: s(values["country"]),
  };
}

/** Key used to group several files that name the same new person/entity. */
export function partyKey(d: Pick<NewInvestorDraft, "email" | "firstName" | "lastName" | "legalName">): string {
  if (d.email) return `e:${d.email.toLowerCase()}`;
  const n = (d.legalName || `${d.firstName} ${d.lastName}`).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return n ? `n:${n}` : "";
}

export function draftProblems(d: NewInvestorDraft): string[] {
  const out: string[] = [];
  if (!d.firstName || !d.lastName) out.push("Enter the investor's first and last name (or the signer's, for an entity or trust).");
  if (d.type !== "individual" && !d.legalName) out.push("Enter the entity or trust legal name.");
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) out.push("Enter a valid email address.");
  return out;
}
