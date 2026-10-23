/** Display-only filtering. Originals stay in their canonical history tables. */
const sensitive = /account_?number|bank_?account|beneficiary_?account|routing|swift|iban|ssn|(^|_)tin|tax_?id|ein$|passport|birth|dob|token|secret|password|authorization|cookie|email|phone|address|signature|payload|url/i;
const freeText = /note|reason|description|message|summary|detail|comment|error|response|body|subject|remediation|explanation/i;
const safeString = /^(id|.*_id|name|legal_name|legal_entity_name|fund_name|previous_name|new_name|status|.*_status|event|event_type|event_kind|action|kind|type|.*_type|section|field|method|currency|direction|purpose|source|source_kind|basis|frequency|role|.*_role|.*_at|.*_on|.*_date|effective_date|classification|reg_type|decision|result|previous|next|from|to|trigger|outcome|version|label)$/i;
export function filterDiagnostic(value: unknown, key = "", depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null) return null;
  if (sensitive.test(key.replace(/[\s-]/g, "")) || freeText.test(key)) return "[withheld]";
  if (depth > 8) return "[withheld]";
  if (typeof value === "object") {
    if (seen.has(value)) return "[withheld]";
    seen.add(value);
    const result = Array.isArray(value)
      ? value.slice(0, 50).map(v => filterDiagnostic(v, key, depth + 1, seen))
      : Object.fromEntries(Object.entries(value).slice(0, 100).map(([k, v]) => [k, filterDiagnostic(v, k, depth + 1, seen)]));
    seen.delete(value);
    return result;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" || !safeString.test(key)) return "[withheld]";
  // Even allowlisted labels must not carry credentials or identifiers embedded in text.
  if (/@|https?:\/\/|\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b\d{9,}\b|bearer\s|secret|password/i.test(value)) return "[withheld]";
  return value.slice(0, 160);
}
export function diagnosticText(value: unknown, key = ""): string {
  const safe = filterDiagnostic(value, key);
  return safe == null ? " · " : typeof safe === "string" ? safe : JSON.stringify(safe);
}