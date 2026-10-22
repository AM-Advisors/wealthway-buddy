/** Parse an optional commitment amount typed in USD. Blank → null; invalid or non-positive → "invalid". */
export function parseCommitmentCents(raw: string): number | null | "invalid" {
  const s = raw.replace(/[,$\s]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "invalid";
  const cents = Math.round(Number(s) * 100);
  return cents > 0 ? cents : "invalid";
}
