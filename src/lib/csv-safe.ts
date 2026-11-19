/**
 * Spreadsheet-safe CSV cells. A text value that begins with =, +, -, @, tab or
 * carriage return is read as a formula by Excel/Sheets, so it is prefixed with
 * an apostrophe. Plain numbers (including negatives like -12.50) are left as-is.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

export function neutralizeCsvText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = String(value);
  if (PLAIN_NUMBER.test(text)) return text;
  return FORMULA_LEAD.test(text) ? `'${text}` : text;
}

/** One quoted, formula-neutralized CSV cell. */
export function csvSafeCell(value: unknown): string {
  return `"${neutralizeCsvText(value).replace(/"/g, '""')}"`;
}
