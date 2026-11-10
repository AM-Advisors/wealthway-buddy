/**
 * Form SS-4 completeness (pure). The lines the IRS needs before a manager may sign.
 * Line 7b (SSN/ITIN) is checked separately against the encrypted vault, never here.
 */
export const SS4_REQUIRED_LINES: [key: string, label: string][] = [
  ["legal_name", "Line 1: legal name of entity"],
  ["mailing_street", "Line 4a: mailing address"],
  ["mailing_city_state_zip", "Line 4b: city, state and ZIP"],
  ["county_state", "Line 6: county and state"],
  ["responsible_party_name", "Line 7a: responsible party name"],
  ["entity_kind", "Line 9a: type of entity"],
  ["reason", "Line 10: reason for applying"],
  ["date_started", "Line 11: date business started"],
  ["closing_month", "Line 12: closing month of accounting year"],
];

export function ss4MissingLines(form: Record<string, unknown> | null | undefined): string[] {
  const f = form ?? {};
  return SS4_REQUIRED_LINES.filter(([k]) => !String(f[k] ?? "").trim()).map(([, label]) => label);
}

/** Signer's edits applied over the sent form; tax IDs and the Harmonious designee can't be changed here. */
export function mergeSignerForm(sent: Record<string, string | boolean>, edits: Record<string, string | boolean> | null | undefined) {
  const out: Record<string, string | boolean> = { ...sent };
  for (const [k, v] of Object.entries(edits ?? {})) {
    if (/tin|ssn|itin/i.test(k) || k.startsWith("designee_")) continue;
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}
