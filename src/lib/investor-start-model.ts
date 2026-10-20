/** Pure rules for the signed-in investor start: own profile basics and starting a fund. */

export const PROFILE_FIELDS = ["legal_first_name", "legal_last_name", "phone", "address_line1", "city", "postal_code", "country"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export const PROFILE_LABELS: Record<ProfileField, string> = {
  legal_first_name: "First name", legal_last_name: "Last name", phone: "Phone", address_line1: "Street address",
  city: "City", postal_code: "ZIP / postal code", country: "Country",
};

/** Fields still blank on the login person's record. Staff are never asked. */
export function missingProfileFields(person: Record<string, unknown> | null, opts: { isStaff: boolean }): ProfileField[] {
  if (opts.isStaff || !person) return [];
  return PROFILE_FIELDS.filter((f) => !String(person[f] ?? "").trim());
}

/** Only blank fields are filled from the profile step; nothing already recorded is overwritten. */
export function profileFillPatch(person: Record<string, unknown>, input: Partial<Record<ProfileField, string>>): Partial<Record<ProfileField, string>> {
  const out: Partial<Record<ProfileField, string>> = {};
  for (const f of PROFILE_FIELDS) {
    const v = String(input[f] ?? "").trim().slice(0, 200);
    if (v && !String(person[f] ?? "").trim()) out[f] = v;
  }
  return out;
}

/** The MSA applies only to people who belong to a client organization (fund managers or someone starting a fund). */
export function msaApplies(clientIds: readonly string[], isStaff: boolean): boolean {
  return !isStaff && clientIds.length > 0;
}

/** Starting a fund: reuse the caller's own organization; only its general partner may start one. */
export type StartFundPlan = { kind: "reuse"; clientId: string } | { kind: "create" } | { kind: "refuse"; reason: string };
export function planStartFund(memberships: { clientId: string; role: string }[]): StartFundPlan {
  const gp = memberships.find((m) => m.role === "client_gp");
  if (gp) return { kind: "reuse", clientId: gp.clientId };
  if (memberships.length) return { kind: "refuse", reason: "Ask your organization's general partner to start a new fund." };
  return { kind: "create" };
}
