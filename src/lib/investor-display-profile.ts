// Display-only merge: signup profile values win; blanks fall back to the
// canonical person / investment profile saved during verification.
type Rec = Record<string, any> | null | undefined;

export function mergeInvestorDisplayProfile(profile: Rec, person: Rec, invProfile: Rec) {
  const pick = (...v: any[]) => v.find((x) => x !== null && x !== undefined && String(x).trim() !== "") ?? null;
  const base = { ...(profile ?? {}) } as Record<string, any>;
  const entity = invProfile && invProfile["profile_type"] && invProfile["profile_type"] !== "individual";
  base["investor_type"] = pick(base["investor_type"], invProfile?.["profile_type"]);
  base["entity_name"] = pick(base["entity_name"], entity ? invProfile?.["legal_name"] : null);
  base["phone"] = pick(base["phone"], person?.["phone"], invProfile?.["phone"]);
  base["date_of_birth"] = pick(base["date_of_birth"], person?.["date_of_birth"]);
  base["citizenship"] = pick(base["citizenship"], person?.["citizenship_country"]);
  const hasAddr = pick(base["address_line1"], base["city"]);
  const src = hasAddr ? base : pick(person?.["address_line1"], person?.["city"]) ? person : invProfile;
  for (const k of ["address_line1", "city", "region", "postal_code", "country"]) {
    base[k] = pick(base[k], src?.[k]);
  }
  return base;
}
