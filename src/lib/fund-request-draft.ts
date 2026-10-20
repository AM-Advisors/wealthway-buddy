/** Persist only an editable draft, and acknowledge only a row read back from the write. */
export async function persistFundRequestDraft(db: any, input: { clientId: string; draftId?: string | null | undefined; request: Record<string, unknown>; userId: string }) {
  const details = { ...input.request, _kind: "fund_request_v2" };
  if (input.draftId) {
    const { data, error } = await db.from("client_fund_intakes")
      .update({ details }).eq("id", input.draftId).eq("client_id", input.clientId)
      .eq("status", "request_draft").select("id").maybeSingle();
    if (error) throw new Error("Your draft could not be saved. Keep this page open and try Save draft again.");
    if (!data) throw new Error("This draft is no longer editable. Your answers are still on this page.");
    return { id: String(data.id) };
  }
  const { data, error } = await db.from("client_fund_intakes")
    .insert({ client_id: input.clientId, status: "request_draft", details, created_by: input.userId })
    .select("id").single();
  if (error || !data) throw new Error("Your draft could not be saved. Keep this page open and try Save draft again.");
  return { id: String(data.id) };
}