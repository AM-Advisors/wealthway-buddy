/**
 * Who may open a person's ID card or full SSN/EIN for one investment.
 * Harmonious staff, or a manager of that exact fund. Team viewers, helpers
 * and other funds' managers never see full numbers.
 */
export type IdentityViewer = { isStaff: boolean; managedOfferingIds: string[] };

export function canOpenIdentity(viewer: IdentityViewer, offeringId: string | null | undefined): boolean {
  if (viewer.isStaff) return true;
  return Boolean(offeringId) && viewer.managedOfferingIds.includes(String(offeringId));
}

export type IdKind = "passport" | "drivers_license" | "state_id" | "unknown";
export const ID_KIND_LABELS: Record<IdKind, string> = {
  passport: "Passport", drivers_license: "Driver's license", state_id: "State ID", unknown: "ID card",
};

/** Paperwork fills blank fields only; anything already on file stays untouched. */
export function blankOnlyFills<T extends Record<string, unknown>>(current: T, found: Partial<Record<keyof T, unknown>>): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(found)) {
    if (v == null || String(v).trim() === "") continue;
    const cur = current[k as keyof T];
    if (cur == null || String(cur).trim() === "") (out as any)[k] = v;
  }
  return out;
}

/** An uploaded ID card is evidence only; it never sets KYC or AML on its own. */
export function kycAfterIdUpload(currentKyc: string): string {
  return currentKyc;
}

export function maskDigits(value: string): string {
  const d = value.replace(/\D/g, "");
  if (d.length === 9) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return d;
}
