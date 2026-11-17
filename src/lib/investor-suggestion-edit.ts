/**
 * Pure rules for a reviewer's corrected value on a suggested investor-record update
 * (for example an AI document reading). The value keeps the same shape as the field:
 * dollar amounts are stored in cents, dates as YYYY-MM-DD, text is trimmed and capped.
 * Anything that looks like a tax number is refused so it never lands in a plain field.
 */
const CENTS_FIELDS = new Set(["commitment_amount_cents"]);
const DATE_FIELDS = new Set(["date_of_birth", "investment_date"]);

export type EditedValue = { ok: true; value: string | number } | { ok: false; error: string };

export function normalizeEditedSuggestion(field: string, raw: string): EditedValue {
  const v = String(raw ?? "").trim();
  if (!v) return { ok: false, error: "Type the corrected value, or use Deny instead." };
  if (CENTS_FIELDS.has(field)) {
    const n = Number(v.replace(/[,$\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Enter the amount in dollars, for example 100000." };
    return { ok: true, value: Math.round(n * 100) };
  }
  if (DATE_FIELDS.has(field)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return { ok: false, error: "Enter the date as YYYY-MM-DD." };
    return { ok: true, value: v };
  }
  if (/\b\d{3}-?\d{2}-?\d{4}\b/.test(v)) return { ok: false, error: "Tax numbers can't be saved here." };
  if (v.length > 300) return { ok: false, error: "That value is too long." };
  return { ok: true, value: v };
}

/** The editable text shown in the Update box for a stored value. */
export function editableSuggestionText(field: string, value: unknown): string {
  if (value == null) return "";
  if (CENTS_FIELDS.has(field) && typeof value === "number") return String(value / 100);
  return String(value);
}
