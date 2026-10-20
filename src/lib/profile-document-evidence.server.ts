/** Scoped reusable evidence; unbound legacy uploads never cross investments. */
export async function loadProfileDocumentEvidence(d: any, row: any) {
  // Manager-added investors may not have an account yet: no owner means no reusable evidence.
  if (!row.investment_profile_id) return [] as any[];
  if (!row.investor_user_id) {
    // Prepared investor (no account yet): only documents staff/managers uploaded for this profile.
    const { data, error } = await d.from("investor_documents").select("id, file_name, doc_kind, uploaded_at, review_status, review_note, investment_profile_id, onboarding_id, user_id, prepared_for_person_id")
      .eq("investment_profile_id", row.investment_profile_id).not("prepared_for_person_id", "is", null).order("uploaded_at", { ascending: false });
    if (error) { console.error("prepared documents lookup failed", error.code, error.message); return [] as any[]; }
    return ((data ?? []) as any[]).filter((r) => r.investment_profile_id === row.investment_profile_id);
  }
  const { data, error } = await d.from("investor_documents").select("id, file_name, doc_kind, uploaded_at, review_status, review_note, investment_profile_id, onboarding_id, user_id")
    .eq("user_id", row.investor_user_id)
    .or(`investment_profile_id.eq.${row.investment_profile_id},and(investment_profile_id.is.null,onboarding_id.eq.${row.id})`)
    .order("uploaded_at", { ascending: false });
  if (error) { console.error("profile documents lookup failed", error.code, error.message); throw new Error("Your profile documents could not be loaded."); }
  const rows = (data ?? []) as any[];
  // Recheck returned scope as well as the query; malformed legacy references are never reused.
  return rows.filter((r) => r.user_id === row.investor_user_id &&
    (r.investment_profile_id === row.investment_profile_id || (r.investment_profile_id == null && r.onboarding_id === row.id)));
}
/** Same scope rules as loadProfileDocumentEvidence, applied to rows already read in one batch. */
export function selectProfileDocumentEvidence(all: any[], row: any) {
  if (!row.investment_profile_id) return [] as any[];
  const picked = !row.investor_user_id
    ? all.filter((r) => r.investment_profile_id === row.investment_profile_id && r.prepared_for_person_id != null)
    : all.filter((r) => r.user_id === row.investor_user_id &&
        (r.investment_profile_id === row.investment_profile_id || (r.investment_profile_id == null && r.onboarding_id === row.id)));
  return picked.sort((a, b) => String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")));
}
