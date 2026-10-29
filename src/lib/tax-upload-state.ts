export type TaxUpload = {
  id: string;
  onboarding_id: string | null;
  investment_profile_id: string | null;
  user_id: string | null;
  doc_kind: string;
  review_status: string | null;
  file_name: string;
};

/** Copy acceptance is not tax certification. Only exact-investment evidence is projected. */
export function pendingTaxUpload(rows: TaxUpload[], investment: { id: string; investment_profile_id: string | null; investor_user_id: string | null }) {
  if (!investment.investment_profile_id || !investment.investor_user_id) return null;
  return rows.find((row) => row.doc_kind === "tax_form"
    && row.onboarding_id === investment.id
    && row.investment_profile_id === investment.investment_profile_id
    && row.user_id === investment.investor_user_id
    && ["new", "accepted"].includes(row.review_status ?? "new")) ?? null;
}

export function taxStateWithUpload<T extends { state: string; reason?: string }>(state: T, upload: TaxUpload | null) {
  if (!upload || state.state !== "missing") return state;
  return { state: "review_required" as const, reason: "Your uploaded tax form is on file. Harmonious needs to confirm its tax certification; you do not need to upload it again." };
}