/**
 * Append-only record of reviewer decisions (admins and fund managers), so
 * activity on the review board can be audited later. Logging is best-effort:
 * a failure here must never block the decision itself.
 */
export type ReviewerActivityInput = {
  actorId: string;
  offeringId?: string | null;
  applicationId?: string | null;
  action: string;
  area?: string | null;
  outcome?: string | null;
  summary: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logReviewerActivity(supabase: any, input: ReviewerActivityInput) {
  try {
    await supabase.from("reviewer_activity").insert({
      actor_id: input.actorId,
      offering_id: input.offeringId ?? null,
      application_id: input.applicationId ?? null,
      action: input.action,
      area: input.area ?? null,
      outcome: input.outcome ?? null,
      summary: input.summary,
      note: input.note || null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // ignore: the decision has already been recorded
  }
}

/** Resolve the fund an application belongs to, for scoping the log entry. */
export async function offeringIdForApplication(
  supabase: any,
  applicationId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("investor_applications")
      .select("offering_id")
      .eq("id", applicationId)
      .maybeSingle();
    return (data?.offering_id as string) ?? null;
  } catch {
    return null;
  }
}
