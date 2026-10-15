export type EmailAttempt = { id: string; at: string; status: "sent" | "failed"; messageId: string | null; actorId: string; kind: string };
export type EmailOutcome = { status: string; at: string | null; detail: string | null };
export function parseEmailAttempt(row: any): EmailAttempt | null {
  if (!String(row.action).startsWith("email_")) return null;
  try {
    const d = JSON.parse(row.reason ?? "{}");
    if (d.version !== 1 || d.provider !== "brevo") return null;
    return { id: row.id, at: row.created_at, status: row.action === "email_sent" ? "sent" : "failed", messageId: typeof d.messageId === "string" ? d.messageId : null, actorId: row.actor_id, kind: d.kind ?? "Invitation" };
  } catch { return null; }
}
export function emailOutcome(attempt: EmailAttempt | null, events: any[], unavailable = false): EmailOutcome {
  if (!attempt) return { status: "Confirmation unavailable", at: null, detail: "No correlated email send is recorded." };
  if (attempt.status === "failed") return { status: "Failed", at: attempt.at, detail: "The email service did not accept this send." };
  if (!attempt.messageId || unavailable) return { status: "Sent", at: attempt.at, detail: "Delivery confirmation unavailable." };
  const matching = events.filter(e => e.messageId === attempt.messageId).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const problem = matching.find(e => ["hardBounces", "softBounces", "blocked", "invalid", "error", "spam"].includes(e.event));
  const delivered = matching.find(e => e.event === "delivered");
  const e = problem ?? delivered;
  return e ? { status: problem ? (["hardBounces", "softBounces"].includes(e.event) ? "Bounced" : "Blocked") : "Delivered", at: e.date, detail: problem ? "Check the recipient address and email-service restrictions before resending." : "Recipient mail server accepted the message; this does not confirm it was read." } : { status: "Sent", at: attempt.at, detail: "Awaiting delivery confirmation." };
}
export function setupGaps(p: any, staff = false): string[] {
  if (!p) return staff ? [] : ["Person record not linked"];
  const gaps: string[] = [];
  if (!p.legal_first_name || !p.legal_last_name) gaps.push("Full name");
  if (!p.email) gaps.push("Email");
  if (!p.phone) gaps.push("Phone");
  if (!staff) {
    if (!p.address_line1 || !p.city || !p.region || !p.postal_code) gaps.push("Address");
    if (p.kyc_status !== "approved") gaps.push("KYC");
    if (p.aml_status !== "approved") gaps.push("AML");
  }
  return gaps;
}