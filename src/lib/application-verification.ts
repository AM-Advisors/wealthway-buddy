/** Exact investing-party verification, separate from account-level access. */
export type ApplicationChecks = { id: string; offering_id: string; kyc_status?: string | null; aml_status?: string | null };

export function investingPartyChecks<T extends ApplicationChecks>(app: T, person: { kyc_status: string | null; aml_status: string | null } | null) {
  // A linked person's pending or missing result must never borrow an old approval.
  return {
    ...app,
    kyc_status: person ? (person.kyc_status ?? "not_started") : (app.kyc_status ?? "not_started"),
    aml_status: person ? (person.aml_status ?? "not_started") : (app.aml_status ?? "not_started"),
  };
}

/** Read through the caller's RLS client. No account/name/email-based identity matching. */
export async function loadApplicationVerification<T extends ApplicationChecks>(supabase: any, app: T) {
  const { data: links, error } = await supabase.from("investor_onboardings")
    .select("person_id, offering_id")
    .eq("application_id", app.id).is("removed_at", null);
  if (error) throw new Error("We couldn't confirm your investment verification. Please try again.");
  const rows = (links ?? []) as { person_id: string | null; offering_id: string }[];
  if (rows.length > 1 || rows.some((r) => r.offering_id !== app.offering_id)) {
    throw new Error("Your investment verification link needs review before continuing.");
  }
  const personId = rows[0]?.person_id;
  if (!personId) {
    // No explicit relationship means the old approval cannot be attributed to
    // this investing party. Never guess from account, fund, signature or amount.
    throw new Error("Your investment verification link needs review before continuing.");
  }
  const { data: person, error: personError } = await supabase.from("persons")
    .select("kyc_status, aml_status, merged_into_person_id").eq("id", personId).maybeSingle();
  if (personError || !person || person.merged_into_person_id) {
    throw new Error("Your investing person's verification needs review before continuing.");
  }
  return investingPartyChecks(app, person);
}