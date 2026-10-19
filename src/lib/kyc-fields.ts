/**
 * Details collected when an investor adds a new investment profile, so the
 * identity provider has what it needs for KYC (people) or KYB (entities).
 * Full tax ID numbers are never stored: only the last four digits are kept.
 */
export type KycField = { key: string; label: string; required: boolean; kind?: "date" | "taxid" | "text" };

const PERSON: KycField[] = [
  { key: "date_of_birth", label: "Date of birth", required: true, kind: "date" },
  { key: "citizenship", label: "Citizenship", required: true },
  { key: "tax_id", label: "SSN or tax ID", required: true, kind: "taxid" },
];
const ADDRESS: KycField[] = [
  { key: "address_line1", label: "Street address", required: true },
  { key: "city", label: "City", required: true },
  { key: "region", label: "State / region", required: true },
  { key: "postal_code", label: "Postal code", required: true },
  { key: "country", label: "Country", required: true },
  { key: "phone", label: "Phone", required: true },
];
const ENTITY: KycField[] = [
  { key: "formation_state", label: "State of formation", required: true },
  { key: "formation_date", label: "Date formed", required: true, kind: "date" },
  { key: "tax_id", label: "EIN", required: true, kind: "taxid" },
  { key: "control_person", label: "Person who controls or signs (name and title)", required: true },
  { key: "beneficial_owners", label: "Owners of 25% or more (name, ownership %, date of birth)", required: true },
];

export function kycFieldsFor(profileType: string, alreadyVerified: boolean): KycField[] {
  if (alreadyVerified) return [];
  switch (profileType) {
    case "individual":
      return [...PERSON, ...ADDRESS];
    case "joint":
      return [...PERSON, ...ADDRESS,
        { key: "second_holder_name", label: "Second holder's legal name", required: true },
        { key: "second_holder_dob", label: "Second holder's date of birth", required: true, kind: "date" },
        { key: "second_holder_tax_id", label: "Second holder's SSN", required: true, kind: "taxid" }];
    case "ira":
      return [...PERSON, ...ADDRESS,
        { key: "custodian_name", label: "IRA custodian", required: true },
        { key: "custodian_account", label: "Custodian account (last 4)", required: true }];
    case "trust":
      return [
        { key: "formation_date", label: "Date trust formed", required: true, kind: "date" },
        { key: "tax_id", label: "Trust tax ID", required: true, kind: "taxid" },
        { key: "trustees", label: "Trustee(s) (names)", required: true },
        { key: "grantor", label: "Grantor (name)", required: true },
        ...ADDRESS,
      ];
    default:
      return [...ENTITY, ...ADDRESS];
  }
}

const COLUMN_KEYS = new Set(["address_line1", "city", "region", "postal_code", "country", "phone"]);

/** Split submitted values into profile columns and details, keeping only last-4 of any ID number. */
export function sanitizeKycInput(profileType: string, values: Record<string, string>) {
  const fields = kycFieldsFor(profileType, false);
  const missing = fields.filter((f) => f.required && !(values[f.key] ?? "").trim()).map((f) => f.label);
  const columns: Record<string, string> = {};
  const details: Record<string, string> = {};
  let taxLast4: string | null = null;
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim().slice(0, 500);
    if (!v) continue;
    if (f.kind === "taxid") {
      const last4 = v.replace(/\D/g, "").slice(-4);
      if (f.key === "tax_id") taxLast4 = last4 || null;
      else details[`${f.key}_last4`] = last4;
    } else if (COLUMN_KEYS.has(f.key)) columns[f.key] = v;
    else details[f.key] = v;
  }
  return { missing, columns, details, taxLast4 };
}
