export type TaxUpload = {
  id: string;
  onboarding_id: string | null;
  investment_profile_id: string | null;
  user_id: string | null;
  doc_kind: string;
  review_status: string | null;
  file_name: string;
  prepared_for_person_id?: string | null;
};

/**
 * Copy acceptance is not tax certification. Only exact-investment evidence is projected:
 * same investment and investing profile, and the investor's own login, or for a record with
 * no login yet, the copy prepared for that investment's recorded person (as upload review checks).
 */
export function pendingTaxUpload(rows: TaxUpload[], investment: { id: string; investment_profile_id: string | null; investor_user_id: string | null; person_id?: string | null }) {
  if (!investment.investment_profile_id) return null;
  const sameParty = (row: TaxUpload) => investment.investor_user_id
    ? row.user_id === investment.investor_user_id
    : !!investment.person_id && row.prepared_for_person_id === investment.person_id;
  if (!investment.investor_user_id && !investment.person_id) return null;
  return rows.find((row) => row.doc_kind === "tax_form"
    && row.onboarding_id === investment.id
    && row.investment_profile_id === investment.investment_profile_id
    && sameParty(row)
    && ["new", "accepted", "completed_outside"].includes(row.review_status ?? "new")) ?? null;
}

export function taxStateWithUpload<T extends { state: string; reason?: string }>(state: T, upload: TaxUpload | null) {
  if (!upload || !["missing", "review_required"].includes(state.state)) return state;
  if (upload.review_status === "completed_outside") return { state: "valid" as const, reason: "Signed tax form recorded as completed outside the platform." } as unknown as T;
  if (state.state !== "missing") return state;
  return { state: "review_required" as const, reason: "Your uploaded tax form is on file. Harmonious needs to confirm its tax certification; you do not need to upload it again." };
}