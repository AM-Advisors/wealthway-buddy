/** Display-safe projection of current signed tax forms. Never reads either identifier vault. */
export async function currentProfileTaxDetails(db: any, profileIds: string[], today = new Date().toISOString().slice(0, 10)) {
  const byProfile = new Map<string, { last4: string | null; type: string | null }>();
  if (!profileIds.length) return byProfile;
  const { data, error } = await db.from("investor_tax_forms")
    .select("investment_profile_id, tin_last4, form_data, certified_at, expires_on, superseded_by")
    .in("investment_profile_id", profileIds).eq("status", "certified")
    .is("superseded_by", null).order("certified_at", { ascending: false });
  if (error) throw new Error("Signed tax-form details could not be loaded. Please try again.");
  for (const form of data ?? []) {
    if (!form.certified_at || (form.expires_on && form.expires_on < today) || byProfile.has(form.investment_profile_id)) continue;
    const kind = form.form_data?.tin_kind;
    byProfile.set(form.investment_profile_id, {
      last4: typeof form.tin_last4 === "string" && /^\d{4}$/.test(form.tin_last4) ? form.tin_last4 : null,
      type: ["ssn", "itin", "ein"].includes(kind) ? kind : null,
    });
  }
  return byProfile;
}