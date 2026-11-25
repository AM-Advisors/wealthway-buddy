/** Only explicit, fully verified US tax identifiers qualify, never document numbers. */
type Row = Record<string, any>;
const approved = (v: unknown) => String(v ?? "").toLowerCase() === "approved";
const us = (v: unknown) => ["US", "USA"].includes(String(v ?? "").toUpperCase());
const norm = (v: unknown) => String(v ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.filter((r) => r && typeof r === "object") : [];
/** Retain check status and correlation, never persist full tax numbers in evidence JSON. */
export function redactTaxIdentifierEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTaxIdentifierEvidence);
  if (!value || typeof value !== 'object') return value;
  const row = value as Row;
  const taxComparison = /^(ssn|social_security_number|ein|tax_number|tax_id)$/i.test(String(row['field'] ?? ''));
  return Object.fromEntries(Object.entries(row).filter(([key]) => !/^(ssn|social_security_number|ein|ein_number|tax_number|tax_id|tax_identification_number)$/i.test(key) && !(taxComparison && ['record','provided','value'].includes(key))).map(([key, item]) => [key, redactTaxIdentifierEvidence(item)]));
}
export function fullTaxNumber(v: unknown): string | null {
  if (typeof v !== "string" || !/^[\d -]+$/.test(v)) return null;
  const digits = v.replace(/[ -]/g, "");
  return /^\d{9}$/.test(digits) && digits !== "000000000" ? digits : null;
}
function unique(values: string[]): string | null {
  const found = [...new Set(values)];
  if (found.length > 1) throw new Error("Verification returned conflicting tax numbers. Staff review is required.");
  return found[0] ?? null;
}
export function verifiedSsn(decision: Row, person: Row): string | null {
  if (!approved(decision['status']) || decision['session_kind'] === "business") return null;
  const found: string[] = [];
  const ids = rows(decision['id_verifications'] ?? (decision['id_verification'] ? [decision['id_verification']] : []));
  for (const id of ids) {
    if (!approved(id['status']) || !us(id['issuing_state']) || (Array.isArray(id['warnings']) && id['warnings'].length)) continue;
    if (!norm(person['legal_first_name']) || !norm(person['legal_last_name']) || !person['date_of_birth']) continue;
    if (norm(id['first_name']) !== norm(person['legal_first_name']) || norm(id['last_name']) !== norm(person['legal_last_name']) || String(id['date_of_birth']).slice(0, 10) !== String(person['date_of_birth']).slice(0, 10)) continue;
    // A US authoritative-source lookup explicitly matching the SSN is evidence;
    // a passport/driver license number, free-text answer or last four is not.
    if (id['verification_method'] !== 'id_lookup' || id['id_lookup']?.outcome !== 'match') continue;
    for (const match of rows(id['id_lookup']?.comparison)) {
      if (!['ssn', 'social_security_number'].includes(match['field']) || match['result'] !== 'match') continue;
      const record = fullTaxNumber(match['record']);
      const provided = fullTaxNumber(match['provided']);
      if (record && provided && record !== provided) throw new Error('Verification returned conflicting tax numbers. Staff review is required.');
      const number = record ?? provided;
      if (number) found.push(number);
    }
  }
  return unique(found);
}
export function verifiedEin(decision: Row, profile: Row): string | null {
  if (!approved(decision['status']) || decision['session_kind'] !== 'business' || !norm(profile['legal_name'])) return null;
  const found: string[] = [];
  for (const check of rows(decision['registry_checks'])) {
    const company = check['company'];
    if (!approved(check['status']) || !approved(company?.status) || company?.is_from_registry !== true || !us(company?.country_code) || (Array.isArray(check['warnings']) && check['warnings'].length)) continue;
    if (norm(company.company_name) !== norm(profile['legal_name'])) continue;
    const number = fullTaxNumber(company.tax_number);
    if (number) found.push(number);
  }
  return unique(found);
}