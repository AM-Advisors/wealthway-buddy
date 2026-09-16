/**
 * Permanent record of everything that happens to an investor's identity,
 * screening and accreditation checks. Rows are only ever added.
 */
export type ComplianceCheckKind = "kyc" | "aml" | "accreditation" | "documents";
export type ComplianceAction =
  | "submitted"
  | "approved"
  | "declined"
  | "info_requested"
  | "document_added";

export async function logComplianceEvent(
  supabase: any,
  input: {
    applicationId: string;
    offeringId: string | null;
    userId: string;
    actorId: string;
    actorRole: "investor" | "fund_manager" | "admin";
    checkKind: ComplianceCheckKind;
    action: ComplianceAction;
    payload?: Record<string, unknown>;
    note?: string | null;
  },
) {
  const { error } = await supabase.from("compliance_submissions").insert({
    application_id: input.applicationId,
    offering_id: input.offeringId,
    user_id: input.userId,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    check_kind: input.checkKind,
    action: input.action,
    payload: input.payload ?? {},
    note: input.note?.toString().trim() ? input.note!.toString().trim() : null,
  });
  // The trail must never block the action it describes.
  if (error) console.error("[compliance-trail]", error.message);
}
