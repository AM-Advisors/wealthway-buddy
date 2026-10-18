/** Scoped reusable evidence; unbound legacy uploads never cross investments. */
export async function loadProfileDocumentEvidence(d: any, row: any) {
  if (!row.investment_profile_id) return [] as any[];
  const { data, error } = await d.from("investor_documents").select("id, file_name, doc_kind, uploaded_at, review_status, review_note, investment_profile_id, onboarding_id, user_id")
    .eq("user_id", row.investor_user_id)
    .or(`investment_profile_id.eq.${row.investment_profile_id},and(investment_profile_id.is.null,onboarding_id.eq.${row.id})`)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error("Your profile documents could not be loaded.");
  const rows = (data ?? []) as any[];
  // Recheck returned scope as well as the query; malformed legacy references are never reused.
  return rows.filter((r) => r.user_id === row.investor_user_id &&
    (r.investment_profile_id === row.investment_profile_id || (r.investment_profile_id == null && r.onboarding_id === row.id)));
}