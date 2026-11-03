import { routineReviewer } from "./fund-routine-access.server";

export type ReviewKind = "terms" | "questions" | "document" | "side_letter";
const SOURCES = {
  terms: { table: "fund_economics_versions", pending: "draft", label: "Fees and terms" },
  questions: { table: "fund_questionnaire_sections", pending: "draft", label: "Additional fund questions" },
  document: { table: "offering_document_versions", pending: "uploaded_review_required", label: "Fund document" },
  side_letter: { table: "side_letter_change_requests", pending: "pending", label: "Side letter" },
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
  const { data: fund, error: fundError } = await db.from("offerings").select("name").eq("id", offeringId).maybeSingle();
  if (fundError || !fund) return { sent: false };
  const { data: managers, error: managerError } = await db.from("fund_managers").select("user_id").eq("offering_id", offeringId).order("user_id");
  if (managerError) throw new Error("Review owner unavailable");
  // Explicit saved assignment wins only if still eligible; otherwise a manager owns it.
  let recipientId: string | null = null;
  if (row.assigned_to && ((managers ?? []).some((m: any) => m.user_id === row.assigned_to) || await routineReviewer(db, row.assigned_to, offeringId))) recipientId = row.assigned_to;
  recipientId ??= managers?.[0]?.user_id ?? null;
  if (!recipientId) return { sent: false };
  const { data: auth, error: authError } = await db.auth.admin.getUserById(recipientId);
  if (authError || !auth?.user?.email_confirmed_at || !auth.user.email) return { sent: false };
  const { sendTemplateEmail } = await import("./email-templates/send-email");
  return sendTemplateEmail("fund-review", auth.user.email, { managed: true,
    idempotencyKey: `fund-review:${kind}:${id}:${recipientId}`,
    templateData: { fundName: fund.name, item: source.label, portalUrl: `https://app.harmonious.co/shared-funds?fund=${offeringId}&review=${kind}&item=${id}` },
  });
}