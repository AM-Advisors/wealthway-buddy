type AuditTarget = { kind: string; id: string; actorId: string; label?: string };
/** Existing append-only access history stores send facts, never links or email content. */
export async function recordUserEmail(target: AuditTarget, result: { sent: boolean; messageId?: string | null }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("user_access_events").insert({
    subject_kind: target.kind, subject_id: target.id, actor_id: target.actorId,
    action: result.sent ? "email_sent" : "email_failed",
    reason: JSON.stringify({ version: 1, provider: "brevo", messageId: result.messageId ?? null, kind: target.label ?? "Invitation" }),
  });
  if (error) throw new Error("Could not record email send history.");
}