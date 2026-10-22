import { responseProjection, type ResponseEvent } from "./sales-response-model";
import type { AcceptKind } from "./sales-acceptance-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function readResponseEvents(db: any, kind: AcceptKind, id: string): Promise<ResponseEvent[]> {
  const quote = kind === "quote";
  const { data, error } = await db.from(quote ? "sales_quote_events" : "sales_document_events").select(quote ? "event,note,created_at" : "event,detail,created_at")
    .eq(quote ? "quote_id" : "document_id", id).in("event", ["response_instructions", "response_pending", "response_sent", "response_failed", "client_reviewed", "client_changes_requested"]).order("created_at");
  if (error) throw new Error("Couldn't load client responses.");
  const { data: clientEvents, error: clientError } = await db.from("sales_client_response_events").select("event,detail,created_at").eq(quote ? "sales_quote_id" : "sales_document_id", id).order("created_at");
  if (clientError) throw new Error("Couldn't load client feedback.");
  return [...(data ?? []).map((e: any) => {
    let detail = e.detail ?? {};
    if (quote) { try { detail = JSON.parse(e.note ?? "{}"); } catch { detail = {}; } }
    return { event: e.event, detail, created_at: e.created_at };
  }), ...(clientEvents ?? [])];
}
export async function recordResponse(db: any, kind: AcceptKind, id: string, actorId: string | null, event: string, detail: Record<string, unknown>) {
  const quote = kind === "quote";
  if (actorId === null) {
    const { error } = await db.from("sales_client_response_events").insert({ sales_quote_id: quote ? id : null, sales_document_id: quote ? null : id, event, detail });
    if (error) throw new Error("Couldn't record client feedback.");
    return;
  }
  const { error } = await db.from(quote ? "sales_quote_events" : "sales_document_events").insert(quote
    ? { quote_id: id, actor_id: actorId, event, note: JSON.stringify(detail) }
    : { document_id: id, actor_id: actorId, event, detail });
  if (error) throw new Error("Couldn't record the client response.");
}

async function staffRecord(userId: string, kind: AcceptKind, id: string) {
  if (kind === "quote") {
    const d = await (await import("./sales-quotes.server")).getQuote(userId, id);
    const q = d.quote;
    return { version: Number(q.version), title: String(q.title), status: String(q.status), signed: !!q.signed_at, canWrite: d.canEdit || ["approved", "sent"].includes(q.status),
      recipients: d.contact?.email ? [{ email: String(d.contact.email).toLowerCase(), name: String(d.contact.full_name), canSign: true }] : [] };
  }
  const d = await (await import("./sales-documents.server")).getDocument(userId, id);
  if (d.doc.kind !== kind) throw new Error("Document not found.");
  const version = Number(d.doc.approved_version ?? d.doc.current_version);
  const sent = d.events.find((e: any) => e.event === "sent" && e.detail?.version === version);
  const to: string[] = sent?.detail?.to ?? [];
  const signers: string[] = sent?.detail?.signers ?? [];
  const team = await (await import("./sales-documents.server")).listClientTeam(userId, id);
  const { data: acceptance, error: acceptanceError } = await (await admin()).from("sales_acceptances").select("id").eq("sales_document_id", id).eq("version", version).maybeSingle();
  if (acceptanceError) throw new Error("Couldn't load the signature status.");
  return { version, title: String(d.doc.title), status: String(d.doc.status), signed: !!acceptance || !!d.packet?.sow?.client_signed_at,
    canWrite: d.perms.canEdit || d.perms.canSend || d.perms.canOutcome,
    recipients: team.filter((r) => to.includes(r.email)).map((r) => ({ email: r.email, name: r.name, canSign: signers.includes(r.email) })) };
}
export async function staffResponses(userId: string, kind: AcceptKind, id: string) {
  const r = await staffRecord(userId, kind, id);
  const db = await admin();
  return { ...responseProjection(await readResponseEvents(db, kind, id), r.version, r.signed, r.status === "sent"),
    recipients: r.recipients, canEdit: r.canWrite && !r.signed, canSend: r.canWrite && !r.signed && ["approved", "sent"].includes(r.status) && r.recipients.length > 0 };
}
export async function saveInstructions(userId: string, kind: AcceptKind, id: string, instructions: string) {
  const r = await staffRecord(userId, kind, id);
  if (!r.canWrite || r.signed) throw new Error("Response instructions can't be changed here.");
  await recordResponse(await admin(), kind, id, userId, "response_instructions", { version: r.version, instructions });
  return { ok: true };
}
export async function sendResponse(userId: string, kind: AcceptKind, id: string, d: { instructions: string; message: string; recipient: string; requestId: string }) {
  const r = await staffRecord(userId, kind, id);
  if (!r.canWrite || r.signed || !["approved", "sent"].includes(r.status)) throw new Error("Only approved, unsigned documents can receive a response.");
  const recipient = r.recipients.find((t) => t.email === d.recipient.toLowerCase());
  if (!recipient) throw new Error("Choose a recorded recipient of this document first.");
  const db = await admin();
  const events = await readResponseEvents(db, kind, id);
  if (events.some((e) => e.detail['requestId'] === d.requestId)) throw new Error("This response was already submitted. Refresh to check its outcome.");
  const detail = { version: r.version, recipient: recipient.email, message: d.message, requestId: d.requestId };
  await recordResponse(db, kind, id, userId, "response_pending", detail);
  await recordResponse(db, kind, id, userId, "response_instructions", { version: r.version, instructions: d.instructions });
  const url = recipient.canSign ? await (await import("./sales-acceptance.server")).acceptLinkFor(kind, id, r.version, recipient.email)
    : await (await import("./email-tracking.server")).signProposalView(id, r.version);
  try {
    const result = await (await import("./email-templates/send-email")).sendTemplateEmail("sales-response", recipient.email, {
      managed: true, idempotencyKey: `sales-response:${id}:${d.requestId}`, templateData: { title: r.title, contactName: recipient.name, message: d.message, instructions: d.instructions, url },
    });
    if (!result.sent) {
      await recordResponse(db, kind, id, userId, "response_failed", { version: r.version, requestId: d.requestId });
      return { sent: false };
    }
  } catch {
    await recordResponse(db, kind, id, userId, "response_failed", { version: r.version, requestId: d.requestId });
    throw new Error("The response couldn't be emailed. Check its history before sending again.");
  }
  await recordResponse(db, kind, id, userId, "response_sent", detail);
  return { sent: true };
}