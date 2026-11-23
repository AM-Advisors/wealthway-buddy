/**
 * Helper-run identity check (no selfie or face match).
 * A helper (the investor's named helper, the fund's managers/team or Harmonious) checks the
 * investor's government ID against the details already on the investor record. The check clears
 * only when the provider finds the ID genuine and unexpired and its name and birthday match the record.
 * Pure rules; the server file performs the provider calls and saves.
 */

export const ASSISTED_MODE = "assisted";
/** Tries per person per rolling day, so a helper cannot keep guessing details against one ID. */
export const ASSISTED_DAILY_LIMIT = 3;

export type RecordFacts = { firstName: string | null; middleName?: string | null; lastName: string | null; dateOfBirth: string | null };
export type IdFacts = { status: string | null; firstName: string | null; lastName: string | null; fullName?: string | null; dateOfBirth: string | null; expirationDate: string | null };

export type AssistedOutcome =
  | { cleared: true; reasons: [] }
  | { cleared: false; reasons: string[] };

const tokens = (v: string | null | undefined) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/[\s'-]+/).filter(Boolean);

/** Details the record needs before a helper can run the check. */
export function missingRecordDetails(r: RecordFacts): string[] {
  const out: string[] = [];
  if (!tokens(r.firstName).length) out.push("legal first name");
  if (!tokens(r.lastName).length) out.push("last name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.dateOfBirth ?? "").slice(0, 10))) out.push("date of birth");
  return out;
}

/** Every first- and last-name word on the record appears on the ID (middle names and extra ID names are allowed). */
export function namesMatch(r: RecordFacts, id: IdFacts): boolean {
  const onId = new Set([...tokens(id.firstName), ...tokens(id.lastName), ...tokens(id.fullName)]);
  const first = tokens(r.firstName);
  const last = tokens(r.lastName);
  if (!first.length || !last.length || !onId.size) return false;
  return [...first, ...last].every((t) => onId.has(t));
}

export function birthdaysMatch(r: RecordFacts, id: IdFacts): boolean {
  const a = String(r.dateOfBirth ?? "").slice(0, 10);
  const b = String(id.dateOfBirth ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(a) && a === b;
}

export function idExpired(id: IdFacts, today: string): boolean {
  const e = String(id.expirationDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(e) && e < today;
}

/** Decide whether the helper-run check clears the investor's identity. */
export function assistedOutcome(r: RecordFacts, id: IdFacts, today: string): AssistedOutcome {
  const reasons: string[] = [];
  const status = String(id.status ?? "").toLowerCase();
  if (status !== "approved") reasons.push(status === "declined"
    ? "The ID didn't pass the authenticity check. Take a clear photo of the original ID, all four corners showing, or use a different ID."
    : "The ID couldn't be confirmed from this photo. Take a clearer photo of the original ID with all four corners showing.");
  if (idExpired(id, today)) reasons.push("This ID has expired. Use a current government ID.");
  if (!namesMatch(r, id)) reasons.push("The name on the ID doesn't match the investor's legal name on file. Check the spelling on the record.");
  if (!birthdaysMatch(r, id)) reasons.push("The date of birth on the ID doesn't match the one on file. Check the date of birth on the record.");
  return reasons.length ? { cleared: false, reasons } : { cleared: true, reasons: [] };
}

/** Whose identity status a helper-run check may set. Approved stays; declined needs Harmonious. */
export function assistedCanRun(kycStatus: string | null): { ok: true } | { ok: false; reason: string } {
  const s = kycStatus ?? "not_started";
  if (s === "approved") return { ok: false, reason: "This investor's identity is already verified." };
  if (s === "declined") return { ok: false, reason: "This investor's identity check was declined, so Harmonious needs to review it." };
  return { ok: true };
}

export function assistedTriesLeft(recentTries: number): number {
  return Math.max(0, ASSISTED_DAILY_LIMIT - recentTries);
}
