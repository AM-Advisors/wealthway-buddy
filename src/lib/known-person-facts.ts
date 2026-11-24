/**
 * Facts we already hold about the person behind a login, gathered from their
 * person record first, then their own individual investing profile, then the
 * login account. Used only to prefill forms the person still confirms; never
 * tax ID numbers, certifications or anything about another party.
 */
export type KnownPersonFacts = {
  legal_first_name: string;
  legal_last_name: string;
  full_name: string;
  date_of_birth: string;
  citizenship: string;
  phone: string;
  address_line1: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
};

type Row = Record<string, unknown> | null | undefined;

const first = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
};

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] ?? "" };
}

export function knownPersonFacts(person: Row, ownIndividualProfile: Row, login: Row): KnownPersonFacts {
  const p = person ?? {};
  const ip = ownIndividualProfile ?? {};
  const l = login ?? {};
  const loginName = splitName(first(l["legal_name"]));
  const profileName = splitName(first(ip["legal_name"]));
  const legal_first_name = first(p["legal_first_name"], profileName.firstName, loginName.firstName);
  const legal_last_name = first(p["legal_last_name"], profileName.lastName, loginName.lastName);
  const personFull = [first(p["legal_first_name"]), first(p["legal_middle_name"]), first(p["legal_last_name"])].filter(Boolean).join(" ");
  return {
    legal_first_name,
    legal_last_name,
    full_name: first(personFull.includes(" ") ? personFull : "", ip["legal_name"], l["legal_name"], personFull),
    date_of_birth: first(p["date_of_birth"], l["date_of_birth"]).slice(0, 10),
    citizenship: first(p["citizenship_country"]),
    phone: first(p["phone"], ip["phone"], l["phone"]),
    address_line1: first(p["address_line1"], ip["address_line1"], l["address_line1"]),
    city: first(p["city"], ip["city"], l["city"]),
    region: first(p["region"], ip["region"], l["region"]),
    postal_code: first(p["postal_code"], ip["postal_code"], l["postal_code"]),
    country: first(p["country"], ip["country"], l["country"]),
  };
}

/** Starting values for the "Complete your profile" fields still blank on the person record. */
export function profileStepPrefill(missing: readonly string[], facts: KnownPersonFacts): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of missing) {
    const v = (facts as Record<string, string>)[f] ?? "";
    if (v) out[f] = v;
  }
  return out;
}

const PERSONAL_TYPES = new Set(["individual", "ira", "joint"]);

/**
 * Starting values for a new investing profile. Only investing as yourself (or
 * your IRA, or jointly as the first holder) reuses your own facts; trusts and
 * companies have their own address and people, so nothing is assumed. Tax ID
 * numbers are never prefilled.
 */
export function newProfilePrefill(profileType: string, facts: KnownPersonFacts | null | undefined): { name: string; kyc: Record<string, string> } {
  if (!facts || !PERSONAL_TYPES.has(profileType)) return { name: "", kyc: {} };
  const kyc: Record<string, string> = {};
  for (const k of ["date_of_birth", "citizenship", "address_line1", "city", "region", "postal_code", "country", "phone"] as const) {
    if (facts[k]) kyc[k] = facts[k];
  }
  return { name: profileType === "joint" ? "" : facts.full_name, kyc };
}
