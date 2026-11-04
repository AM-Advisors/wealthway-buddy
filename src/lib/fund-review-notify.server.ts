import { routineReviewer } from "./fund-routine-access.server";
import { STAFF_ROLES } from "./fund-tabs.server";

export type ReviewKind = "terms" | "questions" | "document" | "side_letter" | "fee_change";
const SOURCES = {
  terms: { table: "fund_economics_versions", pending: "draft", label: "Fees and terms" },
  questions: { table: "fund_questionnaire_sections", pending: "draft", label: "Additional fund questions" },
  document: { table: "offering_document_versions", pending: "uploaded_review_required", label: "Fund document" },
  side_letter: { table: "side_letter_change_requests", pending: "pending", label: "Side letter" },
  fee_change: { table: "fund_fee_terms", pending: "pending_approval", label: "Fee and carry change" },
} as const;

/** Saved-item only, one authorized recipient, no pending-work sweep. */
export async function notifyFundReview(kind: ReviewKind, id: string) {
  try {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return await sendFundReview(db as any, kind, id);
  } catch { console.error("[fund-review] notice unavailable"); return { sent: false }; }
}

export async function sendFundReview(db: any, kind: ReviewKind, id: string) {
  const source = SOURCES[kind];
  const { data: row, error } = await db.from(source.table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Review item unavailable");
  if (!row || (kind === "document" ? row.approval_status : row.status) !== source.pending) return { sent: false };
  let offeringId = row.offering_id;
  if (kind === "terms") {
    const { data: setup, error } = await db.from("fund_setups").select("offering_id").eq("id", row.setup_id).maybeSingle();
    if (error) throw new Error("Fund unavailable");
    offeringId = setup?.offering_id;
  }
  if (!offeringId) return { sent: false };
  const { data: fund, error: fundError } = await db.from("offerings").select("name,routine_review_user_id").eq("id", offeringId).maybeSingle();
  if (fundError || !fund) return { sent: false };
  // Explicit saved assignment wins only if still eligible; otherwise a manager owns it.
  let recipientId: string | null = null;
  const assigned = row.assigned_to ?? fund.routine_review_user_id;
  let managerRecipient = false;
  if (kind === "fee_change") {
    // Post-signing fee changes keep their existing staff-only, non-requester review.
    const { data: roles, error } = await db.from("user_roles").select("user_id,role").in("role", STAFF_ROLES).order("user_id");
    if (error) throw new Error("Fee review owner unavailable");
    const eligible = [...new Set((roles ?? []).map((r: any) => r.user_id as string))].filter(userId => userId !== row.requested_by);
    recipientId = assigned && eligible.includes(assigned) ? assigned : eligible[0] ?? null;
  } else {
    const { data: managers, error: managerError } = await db.from("fund_managers").select("user_id").eq("offering_id", offeringId).order("user_id");
    if (managerError) throw new Error("Review owner unavailable");
    if (assigned && ((managers ?? []).some((m: any) => m.user_id === assigned) || await routineReviewer(db, assigned, offeringId))) recipientId = assigned;
    recipientId ??= managers?.[0]?.user_id ?? null;
    managerRecipient = (managers ?? []).some((m: any) => m.user_id === recipientId);
  }
  if (!recipientId) return { sent: false };
  const { data: auth, error: authError } = await db.auth.admin.getUserById(recipientId);
  if (authError || !auth?.user?.email_confirmed_at || !auth.user.email) return { sent: false };
  const { sendTemplateEmail } = await import("./email-templates/send-email");
  // A changed pending draft is a new review event; retries of that same save dedupe.
  const revision = kind === "terms" && row.updated_at ? `:${row.updated_at}` : "";
  const portalUrl = kind === "fee_change"
    ? `https://ops.harmonious.co/ops/fund/${offeringId}?tab=setup`
    : managerRecipient
      ? `https://app.harmonious.co/manager/fund/${offeringId}?tab=approvals`
      : `https://app.harmonious.co/shared-funds?fund=${offeringId}&review=${kind}&item=${id}`;
  return sendTemplateEmail("fund-review", auth.user.email, { managed: true,
    idempotencyKey: `fund-review:${kind}:${id}:${recipientId}${revision}`,
    templateData: { fundName: fund.name, item: source.label, portalUrl },
  });
}