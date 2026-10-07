/** Server-only Proposals / RFPs / RFQs. Maker-checker approval; prices only from the linked quote; versions append-only. */
import {
  MARKETING_HELPERS, OUTCOMES, SALES_DOC_APPROVERS, SALES_DOC_ROLES, defaultSections, sectionsText,
  type DocDirection, type DocKind, type Section,
} from "@/lib/sales-documents-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const BUCKET = "client-contracts";
const LEADER = ["cro", "executive", "super_admin", "leadership"];

async function rolesOf(userId: string) {
  const { data } = await (await admin()).from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
async function teamOf(userId: string) {
  const { data } = await (await admin()).from("sales_reporting_lines").select("user_id, manager_user_id");
  const all = (data ?? []) as any[]; const seen = new Set([userId]); const q = [userId];
  while (q.length) { const m = q.shift()!; for (const l of all) if (l.manager_user_id === m && !seen.has(l.user_id)) { seen.add(l.user_id); q.push(l.user_id); } }
  return seen;
}
async function event(db: any, documentId: string, actorId: string, ev: string, detail: Record<string, unknown> = {}) {
  await db.from("sales_document_events").insert({ document_id: documentId, actor_id: actorId, event: ev, detail });
}

async function access(userId: string, documentId: string) {
  const db = await admin();
  const roles = await rolesOf(userId);
  const { data: doc } = await db.from("sales_documents").select("*").eq("id", documentId).maybeSingle();
  if (!doc) throw new Error("Document not found.");
  const readOnly = roles.includes("leadership") && !roles.some((r) => ["cro", "executive", "super_admin", "sales_management", "sales", "account_executive", "bdr"].includes(r));
  let salesSee = false;
  if (roles.some((r) => SALES_DOC_ROLES.includes(r))) {
    if (roles.some((r) => LEADER.includes(r))) salesSee = true;
    else if (roles.includes("sales_management")) salesSee = (await teamOf(userId)).has(doc.owner_user_id);
    else salesSee = doc.owner_user_id === userId;
  }
  const { data: assists } = await db.from("sales_document_assist_requests").select("*").eq("document_id", documentId).order("created_at", { ascending: false });
  const activeAssist = ((assists ?? []) as any[]).find((a) => a.status === "open" || a.status === "claimed") ?? null;
  const isMarketing = roles.some((r) => MARKETING_HELPERS.includes(r)) && ((assists ?? []) as any[]).length > 0;
  if (!salesSee && !isMarketing) throw new Error("Document not found.");
  const locked = ["submitted", "sent", ...OUTCOMES.response, ...OUTCOMES.outbound].includes(doc.status);
  const canEdit = !readOnly && !locked && (
    (salesSee && (doc.owner_user_id === userId || roles.some((r) => ["cro", "sales_management"].includes(r)))) ||
    (isMarketing && activeAssist?.status === "claimed" && activeAssist.assignee_user_id === userId));
  const canApprove = !readOnly && doc.status === "submitted" && roles.some((r) => SALES_DOC_APPROVERS.includes(r));
  const isOwner = doc.owner_user_id === userId && !readOnly;
  return { db, roles, doc, assists: (assists ?? []) as any[], activeAssist, isMarketing, salesSee, canEdit, canApprove, isOwner, readOnly };
}

async function latestSections(db: any, doc: any): Promise<Section[]> {
  if (!doc.current_version) return defaultSections(doc.kind, doc.direction);
  const { data } = await db.from("sales_document_versions").select("sections").eq("document_id", doc.id).eq("version", doc.current_version).maybeSingle();
  return (data?.sections ?? []) as Section[];
}
async function writeVersion(db: any, doc: any, sections: Section[], userId: string, source: string) {
  const v = (doc.current_version ?? 0) + 1;
  const { error } = await db.from("sales_document_versions").insert({ document_id: doc.id, version: v, sections, source, created_by: userId });
  if (error) throw new Error(error.message);
  // Any edit after approval sends the document back for approval.
  const status = doc.status === "approved" ? "draft" : doc.status;
  await db.from("sales_documents").update({ current_version: v, status, ...(doc.status === "approved" ? { approved_version: null, approved_by: null, approved_at: null } : {}), updated_at: new Date().toISOString() }).eq("id", doc.id);
  return v;
}

export async function listDocuments(userId: string) {
  const db = await admin();
  const roles = await rolesOf(userId);
  const sales = roles.some((r) => SALES_DOC_ROLES.includes(r));
  const marketing = roles.some((r) => MARKETING_HELPERS.includes(r));
  if (!sales && !marketing) throw new Error("Proposals are for Sales and Marketing staff.");
  let q = db.from("sales_documents").select("id, kind, direction, title, status, owner_user_id, client_id, contact_id, due_date, updated_at").order("updated_at", { ascending: false }).limit(300);
  if (!roles.some((r) => LEADER.includes(r))) {
    if (roles.includes("sales_management")) q = q.in("owner_user_id", [...(await teamOf(userId))]);
    else if (sales) q = q.eq("owner_user_id", userId);
    else q = q.in("id", ((await db.from("sales_document_assist_requests").select("document_id")).data ?? []).map((r: any) => r.document_id).concat(["00000000-0000-0000-0000-000000000000"]));
  }
  const { data } = await q;
  const docs = (data ?? []) as any[];
  const { testDemoIds } = await import("@/lib/user-access.server");
  const td = await testDemoIds().catch(() => ({ clients: new Set<string>() } as any));
  const visible = docs.filter((d) => !d.client_id || !td.clients?.has?.(d.client_id));
  const { names } = await import("@/lib/sales-hub.server");
  const nm = await names(visible.map((d) => d.owner_user_id));
  const cids = [...new Set(visible.map((d) => d.client_id).filter(Boolean))];
  const { data: cl } = cids.length ? await db.from("clients").select("id, name").in("id", cids) : { data: [] };
  const cn = new Map(((cl ?? []) as any[]).map((c) => [c.id, c.name]));
  return {
    documents: visible.map((d) => ({ ...d, ownerName: nm.get(d.owner_user_id) ?? "-", clientName: d.client_id ? cn.get(d.client_id) ?? "-" : null })),
    canCreate: sales && !(roles.includes("leadership") && roles.length === 1),
  };
}

export async function createOptions(userId: string) {
  const db = await admin();
  const roles = await rolesOf(userId);
  const all = roles.some((r) => LEADER.includes(r));
  let deals = db.from("crm_deals").select("id, title, contact_id, client_id, owner_user_id").eq("scope", "harmonious").is("archived_at", null).order("updated_at", { ascending: false }).limit(200);
  let contacts = db.from("crm_contacts").select("id, full_name, email, organization, owner_user_id").eq("scope", "harmonious").is("archived_at", null).order("full_name").limit(500);
  let quotes = db.from("sales_quotes").select("id, quote_number, title, client_id, contact_id, deal_id, total_cents, status, owner_user_id").order("created_at", { ascending: false }).limit(200);
  if (!all) { deals = deals.eq("owner_user_id", userId); contacts = contacts.eq("owner_user_id", userId); quotes = quotes.eq("owner_user_id", userId); }
  const [d, c, q, cl] = await Promise.all([deals, contacts, quotes, db.from("clients").select("id, name").order("name").limit(500)]);
  return { deals: d.data ?? [], contacts: c.data ?? [], quotes: q.data ?? [], clients: cl.data ?? [] };
}

export async function createDocument(userId: string, d: { kind: DocKind; direction: DocDirection; title: string; dealId?: string | null | undefined; contactId?: string | null | undefined; clientId?: string | null | undefined; quoteId?: string | null | undefined; recipientName?: string | null | undefined; recipientEmail?: string | null | undefined; dueDate?: string | null | undefined }) {
  const db = await admin();
  const roles = await rolesOf(userId);
  if (!roles.some((r) => SALES_DOC_ROLES.includes(r) && r !== "leadership")) throw new Error("Only Sales staff can create proposals.");
  let { contactId, clientId } = d;
  if (d.quoteId) {
    const { data: q } = await db.from("sales_quotes").select("owner_user_id, client_id, contact_id").eq("id", d.quoteId).maybeSingle();
    if (!q) throw new Error("Quote not found.");
    if (q.owner_user_id !== userId && !roles.some((r) => LEADER.includes(r) || r === "sales_management")) throw new Error("You can only use your own quotes.");
    clientId ??= q.client_id; contactId ??= q.contact_id;
  }
  let recipientEmail = d.recipientEmail ?? null; let recipientName = d.recipientName ?? null;
  if (contactId && !recipientEmail) {
    const { data: c } = await db.from("crm_contacts").select("full_name, email").eq("id", contactId).maybeSingle();
    recipientEmail = c?.email ?? null; recipientName ??= c?.full_name ?? null;
  }
  const { data, error } = await db.from("sales_documents").insert({
    kind: d.kind, direction: d.direction, title: d.title, owner_user_id: userId, deal_id: d.dealId ?? null, contact_id: contactId ?? null,
    client_id: clientId ?? null, quote_id: d.quoteId ?? null, recipient_name: recipientName, recipient_email: recipientEmail, due_date: d.dueDate ?? null,
  }).select("*").single();
  if (error) throw new Error(error.message);
  await writeVersion(db, data, defaultSections(d.kind, d.direction), userId, "created");
  await event(db, data.id, userId, "created", { kind: d.kind, direction: d.direction });
  return { id: data.id as string };
}

export async function getDocument(userId: string, id: string) {
  const a = await access(userId, id);
  const { db, doc } = a;
  const sections = await latestSections(db, doc);
  const { data: versions } = await db.from("sales_document_versions").select("version, source, created_by, created_at").eq("document_id", id).order("version", { ascending: false });
  const { data: events } = await db.from("sales_document_events").select("event, actor_id, detail, created_at").eq("document_id", id).order("created_at", { ascending: false }).limit(100);
  const quoteLines = doc.quote_id ? ((await db.from("sales_quote_lines").select("label, quantity, unit_cents, line_cents").eq("quote_id", doc.quote_id).order("sort_order")).data ?? []) : [];
  const { data: evs } = await db.from("marketing_email_events").select("kind, ip_hash, user_agent, occurred_at").eq("sales_document_id", id).order("occurred_at", { ascending: true }).limit(2000);
  const E = (evs ?? []) as any[];
  const engagement = { opens: E.filter((e) => e.kind === "open").length, clicks: E.filter((e) => e.kind === "click").length,
    firstOpenedAt: E.find((e) => e.kind === "open")?.occurred_at ?? null, lastActivityAt: E.length ? E[E.length - 1].occurred_at : null,
    devices: new Set(E.map((e) => `${e.ip_hash ?? ""}|${e.user_agent ?? ""}`)).size };
  const { names } = await import("@/lib/sales-hub.server");
  const ids = [doc.owner_user_id, doc.approved_by, ...((versions ?? []) as any[]).map((v) => v.created_by), ...((events ?? []) as any[]).map((e) => e.actor_id), ...a.assists.flatMap((x) => [x.requested_by, x.assignee_user_id])].filter(Boolean);
  const nm = await names(ids);
  const n = (x: string | null) => (x ? nm.get(x) ?? "Team member" : null);
  return {
    doc: { ...doc, source_text: doc.source_text ? String(doc.source_text).slice(0, 2000) : null, ownerName: n(doc.owner_user_id), approvedByName: n(doc.approved_by) },
    sections, quoteLines, engagement,
    versions: ((versions ?? []) as any[]).map((v) => ({ ...v, byName: n(v.created_by) })),
    events: ((events ?? []) as any[]).map((e) => ({ ...e, byName: n(e.actor_id) })),
    assists: a.assists.map((x) => ({ ...x, requestedByName: n(x.requested_by), assigneeName: n(x.assignee_user_id) })),
    perms: {
      canEdit: a.canEdit, canApprove: a.canApprove && doc.owner_user_id !== userId && !((versions ?? []) as any[]).some((v) => v.created_by === userId && v.source !== "created"),
      isOwner: a.isOwner, isMarketing: a.isMarketing, canRequestHelp: a.isOwner && !a.activeAssist && ["draft", "approved"].includes(doc.status),
      canSubmit: a.isOwner && doc.status === "draft", canSend: a.isOwner && doc.status === "approved", canOutcome: a.isOwner && doc.status === "sent",
      canExport: doc.status !== "draft" || a.salesSee, userId,
    },
  };
}

export async function saveSections(userId: string, id: string, sections: Section[]) {
  const a = await access(userId, id);
  if (!a.canEdit) throw new Error("You can't edit this document right now.");
  const v = await writeVersion(a.db, a.doc, sections, userId, a.isMarketing && !a.salesSee ? "marketing" : "edit");
  await event(a.db, id, userId, "edited", { version: v, wasApproved: a.doc.status === "approved" });
  return { version: v };
}

export async function uploadSource(userId: string, id: string, file: { name: string; base64: string; type: string }) {
  const a = await access(userId, id);
  if (!a.canEdit) throw new Error("You can't edit this document right now.");
  const kind = file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf") ? "pdf" : file.name.toLowerCase().endsWith(".docx") ? "docx" : null;
  if (!kind) throw new Error("Upload a PDF or Word (.docx) file.");
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  if (bytes.length > 15 * 1024 * 1024) throw new Error("The file is larger than 15 MB.");
  const { readDocumentText } = await import("@/lib/contract-ingestion.server");
  const { pages } = await readDocumentText(bytes, kind);
  const text = pages.join("\n\n").slice(0, 60000);
  const path = `sales-documents/${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const up = await a.db.storage.from(BUCKET).upload(path, bytes, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw new Error("The file couldn't be stored.");
  await a.db.from("sales_documents").update({ source_file_name: file.name, source_path: path, source_text: text, updated_at: new Date().toISOString() }).eq("id", id);
  await event(a.db, id, userId, "source_uploaded", { name: file.name, chars: text.length });
  return { chars: text.length };
}

function pricingBody(lines: any[]) {
  if (!lines.length) return "";
  const money = (c: number) => `$${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rows = lines.map((l) => `- ${l.label}: ${l.quantity} x ${money(l.unit_cents)} = ${money(l.line_cents)}`);
  const total = lines.reduce((s, l) => s + Number(l.line_cents || 0), 0);
  return `${rows.join("\n")}\nTotal: ${money(total)}\n(Pricing from the approved quote.)`;
}

export async function draftWithAi(userId: string, id: string, brief: string | null) {
  const a = await access(userId, id);
  if (!a.canEdit) throw new Error("You can't edit this document right now.");
  const { db, doc } = a;
  const current = await latestSections(db, doc);
  const [client, contact, deal] = await Promise.all([
    doc.client_id ? db.from("clients").select("name").eq("id", doc.client_id).maybeSingle() : { data: null },
    doc.contact_id ? db.from("crm_contacts").select("full_name, organization, title").eq("id", doc.contact_id).maybeSingle() : { data: null },
    doc.deal_id ? db.from("crm_deals").select("title, service_key, sales_stage").eq("id", doc.deal_id).maybeSingle() : { data: null },
  ]);
  const quoteLines = doc.quote_id ? ((await db.from("sales_quote_lines").select("label, quantity, unit_cents, line_cents").eq("quote_id", doc.quote_id).order("sort_order")).data ?? []) as any[] : [];
  const { draftSections } = await import("@/lib/sales-documents-ai.server");
  const out = await draftSections({
    kind: doc.kind, direction: doc.direction, title: doc.title, brief,
    context: { client: client?.data?.name ?? null, contact: contact?.data ?? null, deal: deal?.data ?? null, services: quoteLines.map((l) => l.label) },
    sourceText: doc.source_text, sections: current,
  });
  // Prices are never AI-written: the pricing section is filled from the quote lines.
  const priceKey = doc.direction === "response" ? (doc.kind === "rfq" ? "pricing" : "services") : null;
  const sections = out.map((s) => (priceKey && s.key === priceKey && quoteLines.length ? { ...s, body: `${s.body.replace(/\$[\d,.]+/g, "").trim()}\n\n${pricingBody(quoteLines)}`.trim() } : s));
  const v = await writeVersion(db, doc, sections, userId, "ai_draft");
  await event(db, id, userId, "ai_drafted", { version: v });
  return { version: v };
}

export async function requestHelp(userId: string, id: string, d: { note: string; sections: string[]; dueDate: string | null }) {
  const a = await access(userId, id);
  if (!a.isOwner) throw new Error("Only the document owner can ask Marketing for help.");
  if (a.activeAssist) throw new Error("Marketing already has an open request on this document.");
  await a.db.from("sales_document_assist_requests").insert({ document_id: id, requested_by: userId, note: d.note, sections: d.sections, due_date: d.dueDate });
  await a.db.from("sales_documents").update({ status: "with_marketing", updated_at: new Date().toISOString() }).eq("id", id);
  await event(a.db, id, userId, "marketing_requested", { sections: d.sections, due: d.dueDate });
  return { ok: true };
}

export async function marketingQueue(userId: string) {
  const db = await admin();
  const roles = await rolesOf(userId);
  if (!roles.some((r) => MARKETING_HELPERS.includes(r) || LEADER.includes(r))) throw new Error("The Sales requests queue is for Marketing.");
  const { data } = await db.from("sales_document_assist_requests").select("*").order("created_at", { ascending: false }).limit(200);
  const reqs = (data ?? []) as any[];
  const ids = [...new Set(reqs.map((r) => r.document_id))];
  const { data: docs } = ids.length ? await db.from("sales_documents").select("id, title, kind, direction, status").in("id", ids) : { data: [] };
  const dm = new Map(((docs ?? []) as any[]).map((d) => [d.id, d]));
  const { names } = await import("@/lib/sales-hub.server");
  const nm = await names(reqs.flatMap((r) => [r.requested_by, r.assignee_user_id]).filter(Boolean));
  return {
    requests: reqs.map((r) => ({ ...r, doc: dm.get(r.document_id) ?? null, requestedByName: nm.get(r.requested_by) ?? "-", assigneeName: r.assignee_user_id ? nm.get(r.assignee_user_id) ?? "-" : null })),
    canClaim: roles.some((r) => MARKETING_HELPERS.includes(r)), userId,
  };
}

export async function claimHelp(userId: string, requestId: string) {
  const db = await admin();
  const roles = await rolesOf(userId);
  if (!roles.some((r) => MARKETING_HELPERS.includes(r))) throw new Error("Only Marketing can take Sales requests.");
  const { data, error } = await db.from("sales_document_assist_requests").update({ status: "claimed", assignee_user_id: userId, updated_at: new Date().toISOString() }).eq("id", requestId).eq("status", "open").select("document_id").maybeSingle();
  if (error || !data) throw new Error("Someone already took this request.");
  await event(db, data.document_id, userId, "marketing_claimed");
  return { documentId: data.document_id as string };
}

export async function returnHelp(userId: string, requestId: string, note: string | null) {
  const db = await admin();
  const { data: r } = await db.from("sales_document_assist_requests").select("*").eq("id", requestId).maybeSingle();
  if (!r) throw new Error("Request not found.");
  const { data: doc } = await db.from("sales_documents").select("owner_user_id").eq("id", r.document_id).maybeSingle();
  const cancel = doc?.owner_user_id === userId && r.status === "open";
  if (!cancel && !(r.status === "claimed" && r.assignee_user_id === userId)) throw new Error("Only the marketer working on it can hand it back.");
  await db.from("sales_document_assist_requests").update({ status: cancel ? "cancelled" : "returned", return_note: note, updated_at: new Date().toISOString() }).eq("id", requestId);
  await db.from("sales_documents").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", r.document_id);
  await event(db, r.document_id, userId, cancel ? "marketing_cancelled" : "marketing_returned", { note });
  return { ok: true };
}

export async function submitForApproval(userId: string, id: string) {
  const a = await access(userId, id);
  if (!a.isOwner || a.doc.status !== "draft") throw new Error("Only a draft can be submitted by its owner.");
  await a.db.from("sales_documents").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", id);
  await event(a.db, id, userId, "submitted", { version: a.doc.current_version });
  return { ok: true };
}

export async function decide(userId: string, id: string, approve: boolean, note: string | null) {
  const a = await access(userId, id);
  if (!a.canApprove) throw new Error("Only a Sales Manager or the CRO can approve.");
  if (a.doc.owner_user_id === userId && approve && !(await (await import("@/lib/self-approval.server")).selfApprove(userId, "sales_document", [id]))) throw new Error("You can't approve your own document.");
  const { data: authored } = await a.db.from("sales_document_versions").select("id").eq("document_id", id).eq("created_by", userId).neq("source", "created").limit(1);
  if ((authored ?? []).length) throw new Error("You edited this document, so someone else has to approve it.");
  await a.db.from("sales_documents").update(approve
    ? { status: "approved", approved_version: a.doc.current_version, approved_by: userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { status: "draft", updated_at: new Date().toISOString() }).eq("id", id);
  await event(a.db, id, userId, approve ? "approved" : "rejected", { version: a.doc.current_version, note });
  return { ok: true };
}

async function approvedSections(a: Awaited<ReturnType<typeof access>>) {
  const v = a.doc.approved_version ?? a.doc.current_version;
  const { data } = await a.db.from("sales_document_versions").select("sections").eq("document_id", a.doc.id).eq("version", v).maybeSingle();
  return (data?.sections ?? []) as Section[];
}

export async function sendDocument(userId: string, id: string, d: { subject: string; message: string }) {
  const a = await access(userId, id);
  if (!a.isOwner || a.doc.status !== "approved") throw new Error("Only an approved document can be sent, by its owner.");
  if (!a.doc.contact_id) throw new Error("Link a contact with an email address before sending.");
  const sections = await approvedSections(a);
  const { data: contact } = await a.db.from("crm_contacts").select("email").eq("id", a.doc.contact_id).maybeSingle();
  if (!contact?.email) throw new Error("This contact has no email address.");
  const recipient = String(contact.email).toLowerCase();
  const key = `prop:${id}`;
  const { signProposalView, buildTrackedUrl, buildOpenPixelUrl } = await import("@/lib/email-tracking.server");
  const view = await signProposalView(id, a.doc.approved_version ?? a.doc.current_version);
  const link = await buildTrackedUrl({ url: view, recipient, template: key, label: "View document" });
  const pixel = await buildOpenPixelUrl({ recipient, template: key });
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const para = (t: string) => esc(t).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br/>")}</p>`).join("");
  const html = `<!doctype html><html><body style="font-family:Poppins,Arial,sans-serif;color:#221F20;line-height:1.5">${para(d.message)}`
    + `<p style="margin:20px 0"><a href="${link}" style="background:#142647;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">View ${esc(a.doc.title)}</a></p>`
    + sections.map((s) => `<h3 style="color:#142647;font-family:Rubik,Arial,sans-serif;margin:20px 0 6px">${esc(s.title)}</h3>${s.question ? `<p style="color:#666"><em>Question: ${esc(s.question)}</em></p>` : ""}${para(s.body || "")}`).join("")
    + `<img src="${pixel}" width="1" height="1" alt="" style="display:none"/></body></html>`;
  const { sendOutreach } = await import("@/lib/sales-hub.server");
  await sendOutreach(userId, { contactId: a.doc.contact_id, channel: "email", subject: d.subject, body: `${d.message}\n\nView the full document: ${link}\n\n---\n${a.doc.title}\n\n${sectionsText(sections)}`, html, visibility: "team" });
  await a.db.from("sales_documents").update({ status: "sent", sent_at: new Date().toISOString(), sent_to: recipient, updated_at: new Date().toISOString() }).eq("id", id);
  await event(a.db, id, userId, "sent", { version: a.doc.approved_version });
  return { ok: true };
}

export async function setOutcome(userId: string, id: string, outcome: string) {
  const a = await access(userId, id);
  if (!a.isOwner) throw new Error("Only the owner can record the outcome.");
  const allowed = OUTCOMES[a.doc.direction as DocDirection];
  if (!allowed.includes(outcome) || !["sent", ...allowed].includes(a.doc.status)) throw new Error("That outcome isn't available.");
  await a.db.from("sales_documents").update({ status: outcome, updated_at: new Date().toISOString() }).eq("id", id);
  await event(a.db, id, userId, "outcome", { outcome });
  return { ok: true };
}

export async function exportDocument(userId: string, id: string, format: "pdf" | "docx") {
  const a = await access(userId, id);
  const sections = a.doc.status === "draft" || a.doc.status === "with_marketing" || a.doc.status === "submitted" ? await latestSections(a.db, a.doc) : await approvedSections(a);
  const draft = !a.doc.approved_version;
  const { renderDocx, renderPdf } = await import("@/lib/sales-documents-render.server");
  const bytes = format === "pdf" ? await renderPdf(a.doc, sections, draft) : await renderDocx(a.doc, sections, draft);
  await event(a.db, id, userId, "exported", { format, draft });
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return { base64: btoa(bin), fileName: `${a.doc.title.replace(/[^\w -]/g, "").trim() || "document"}${draft ? " (draft)" : ""}.${format}` };
}
