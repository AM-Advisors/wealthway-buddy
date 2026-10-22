/** Server-only Proposals / RFPs / RFQs. Maker-checker approval; prices only from the linked quote; versions append-only. */
import {
  MARKETING_HELPERS, OUTCOMES, SALES_DOC_APPROVERS, SALES_DOC_ROLES, defaultSections, sectionsText, applyLockedSections, lockedKeys, ABOUT_HARMONIOUS,
  type DocDirection, type DocKind, type Section,
} from "@/lib/sales-documents-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const BUCKET = "client-contracts";
const LEADER = ["cro", "executive", "super_admin", "leadership"];
import { canAddSalesContact, type SalesContactInput } from "@/lib/sales-contact-model";

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

export const EXEC_DIRECT_SEND_ROLES = ["cro", "executive"];

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
  const isMarketing = false; // Marketing no longer takes part in proposals.
  if (!salesSee && !isMarketing) throw new Error("Document not found.");
  const locked = ["submitted", "sent", ...OUTCOMES.response, ...OUTCOMES.outbound].includes(doc.status);
  const canEdit = !readOnly && !locked && (
    (salesSee && (doc.owner_user_id === userId || roles.some((r) => ["cro", "sales_management"].includes(r)))) ||
    (isMarketing && activeAssist?.status === "claimed" && activeAssist.assignee_user_id === userId));
  const canApprove = !readOnly && doc.status === "submitted" && roles.some((r) => SALES_DOC_APPROVERS.includes(r));
  const isOwner = doc.owner_user_id === userId && !readOnly;
  // CRO and CEO (executive) owners may send their own draft/submitted documents directly; the send records the approval.
  const execDirect = isOwner && roles.some((r) => EXEC_DIRECT_SEND_ROLES.includes(r)) && ["draft", "submitted"].includes(doc.status);
  return { db, roles, doc, assists: (assists ?? []) as any[], activeAssist, isMarketing, salesSee, canEdit, canApprove, isOwner, readOnly, execDirect };
}

async function latestSections(db: any, doc: any): Promise<Section[]> {
  if (!doc.current_version) return defaultSections(doc.kind, doc.direction);
  const { data } = await db.from("sales_document_versions").select("sections").eq("document_id", doc.id).eq("version", doc.current_version).maybeSingle();
  return applyLockedSections(doc.kind, doc.direction, (data?.sections ?? []) as Section[], await lockFacts(db, doc));
}
async function currentAbout(db: any): Promise<string | null> {
  const { data } = await db.from("sales_controlled_texts").select("body").eq("text_key", "about_harmonious").order("version", { ascending: false }).limit(1).maybeSingle();
  return data?.body ?? null;
}
const ABOUT_EDITORS = ["super_admin"];

/** Controlled About Harmonious wording: everyone in Sales reads it; only a Super Admin saves new versions. */
export async function getAboutHarmonious(userId: string) {
  const roles = await rolesOf(userId);
  if (!roles.some((r) => SALES_DOC_ROLES.includes(r) || ABOUT_EDITORS.includes(r))) throw new Error("Not available for your role.");
  const db = await admin();
  const { data } = await db.from("sales_controlled_texts").select("version, body, reason, created_by, created_at").eq("text_key", "about_harmonious").order("version", { ascending: false }).limit(20);
  const rows = (data ?? []) as any[];
  const { names } = await import("@/lib/sales-hub.server");
  const nm = await names(rows.map((r) => r.created_by));
  return { body: rows[0]?.body ?? ABOUT_HARMONIOUS, isDefault: !rows.length, canEdit: roles.some((r) => ABOUT_EDITORS.includes(r)),
    history: rows.map((r) => ({ version: r.version, reason: r.reason, at: r.created_at, byName: nm.get(r.created_by) ?? "Team member" })) };
}
export async function saveAboutHarmonious(userId: string, body: string, reason: string | null) {
  const roles = await rolesOf(userId);
  if (!roles.some((r) => ABOUT_EDITORS.includes(r))) throw new Error("Only a Super Admin can change the About Harmonious wording.");
  const db = await admin();
  const text = body.trim();
  if (text.length < 20) throw new Error("The wording is too short.");
  if (!reason || reason.trim().length < 3) throw new Error("Give a reason for the change.");
  const { data: last } = await db.from("sales_controlled_texts").select("version, body").eq("text_key", "about_harmonious").order("version", { ascending: false }).limit(1).maybeSingle();
  if (last?.body === text) return { version: last.version as number };
  const version = (last?.version ?? 0) + 1;
  const { error } = await db.from("sales_controlled_texts").insert({ text_key: "about_harmonious", version, body: text, reason, created_by: userId });
  if (error) throw new Error("The wording couldn't be saved. Please try again.");
  return { version };
}

async function publishedMsa(db: any) {
  const { data: v } = await db.from("msa_versions").select("id, version, effective_date").eq("status", "published").lte("effective_date", new Date().toISOString().slice(0, 10)).order("effective_date", { ascending: false }).limit(1).maybeSingle();
  if (!v) return null;
  const { data: secs } = await db.from("msa_sections").select("section_no, title, body").eq("msa_version_id", v.id).order("sort_order");
  return { version: v.version as string, effectiveDate: v.effective_date as string | null, sections: (secs ?? []) as any[] };
}
async function lockFacts(db: any, doc: any) {
  const [client, contact, lines] = await Promise.all([
    doc.client_id ? db.from("clients").select("name").eq("id", doc.client_id).maybeSingle() : { data: null },
    doc.contact_id ? db.from("crm_contacts").select("full_name, organization").eq("id", doc.contact_id).maybeSingle() : { data: null },
    doc.quote_id ? db.from("sales_quote_lines").select("label, quantity, unit_cents, line_cents, billing_frequency").eq("quote_id", doc.quote_id).order("sort_order") : { data: [] },
  ]);
  return { msa: await publishedMsa(db), about: await currentAbout(db), organization: client.data?.name ?? contact.data?.organization ?? null, contactName: doc.recipient_name ?? contact.data?.full_name ?? null, lines: (lines.data ?? []) as any[] };
}
async function writeVersion(db: any, doc: any, rawSections: Section[], userId: string, source: string) {
  // Summary, pricing and About Harmonious are always platform-generated; any typed or AI text for them is replaced.
  const sections = applyLockedSections(doc.kind, doc.direction, rawSections, await lockFacts(db, doc));
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
  if (!sales) throw new Error("Proposals are for Sales staff.");
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
  const lockedSectionKeys = lockedKeys(doc.kind, doc.direction);
  const { data: versions } = await db.from("sales_document_versions").select("version, source, created_by, created_at").eq("document_id", id).order("version", { ascending: false });
  const { data: events } = await db.from("sales_document_events").select("event, actor_id, detail, created_at").eq("document_id", id).order("created_at", { ascending: false }).limit(100);
  const quoteLines = doc.quote_id ? ((await db.from("sales_quote_lines").select("label, quantity, unit_cents, line_cents").eq("quote_id", doc.quote_id).order("sort_order")).data ?? []) : [];
  let packet: any = null;
  if (doc.quote_id) {
    const { data: qt } = await db.from("sales_quotes").select("id, quote_number, version, status, total_cents, sow_id, msa_id").eq("id", doc.quote_id).maybeSingle();
    if (qt) {
      const [sow, msa] = await Promise.all([
        qt.sow_id ? db.from("client_sows").select("id, status, client_signed_at, executed_at").eq("id", qt.sow_id).maybeSingle() : { data: null },
        qt.msa_id ? db.from("client_msa_agreements").select("id, status, executed_at").eq("id", qt.msa_id).maybeSingle() : { data: null },
      ]);
      packet = { quote: qt, sow: sow.data, msa: msa.data };
    }
  }
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
    sections, lockedSectionKeys, quoteLines, engagement, packet,
    versions: ((versions ?? []) as any[]).map((v) => ({ ...v, byName: n(v.created_by) })),
    events: ((events ?? []) as any[]).map((e) => ({ ...e, byName: n(e.actor_id) })),
    assists: a.assists.map((x) => ({ ...x, requestedByName: n(x.requested_by), assigneeName: n(x.assignee_user_id) })),
    perms: {
      canEdit: a.canEdit, canApprove: a.canApprove && doc.owner_user_id !== userId && !((versions ?? []) as any[]).some((v) => v.created_by === userId && v.source !== "created"),
      isOwner: a.isOwner, isMarketing: a.isMarketing, canRequestHelp: false,
      canSubmit: a.isOwner && doc.status === "draft", canSend: (a.isOwner && doc.status === "approved") || a.execDirect, directSend: a.execDirect, canOutcome: a.isOwner && doc.status === "sent",
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
  const v = await writeVersion(db, doc, out, userId, "ai_draft");
  await event(db, id, userId, "ai_drafted", { version: v });
  return { version: v };
}

export async function requestHelp(_userId: string, _id: string, _d: { note: string; sections: string[]; dueDate: string | null }): Promise<{ ok: true }> {
  throw new Error("Marketing help is no longer part of proposals.");
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
  if (a.doc.direction === "response" && !(await publishedMsa(a.db))) throw new Error("No published Master Services Agreement is available for the Terms section. Ask Legal to publish one first.");
  await a.db.from("sales_documents").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", id);
  await event(a.db, id, userId, "submitted", { version: a.doc.current_version });
  return { ok: true };
}

export async function decide(userId: string, id: string, approve: boolean, note: string | null) {
  const a = await access(userId, id);
  if (!a.canApprove) throw new Error("Only a Sales Manager or the CRO can approve.");
  if (a.doc.owner_user_id === userId && approve && !(await (await import("@/lib/self-approval.server")).selfApprove(userId, "sales_document", [id]))) throw new Error("You can't approve your own document.");
  const { data: authored } = await a.db.from("sales_document_versions").select("id").eq("document_id", id).eq("created_by", userId).neq("source", "created").limit(1);
  if ((authored ?? []).length && !(approve && a.doc.owner_user_id !== userId && await (await import("@/lib/self-approval.server")).selfApprove(userId, "sales_document", [id]))) throw new Error("You edited this document, so someone else has to approve it.");
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

export async function sendDocument(userId: string, id: string, d: { subject: string; message: string; ccUserIds?: string[] | undefined; toContactIds?: string[] | undefined; signerContactIds?: string[] | undefined; extraCc?: string[] | undefined }) {
  const a = await access(userId, id);
  const allowed = await listCcOptions(userId);
  const emailRe = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
  const extra = (d.extraCc ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (extra.some((e) => !emailRe.test(e))) throw new Error("One of the extra CC addresses isn't a valid email.");
  const ccAll = [...new Set([...(d.ccUserIds ?? []).map((u) => allowed.find((o) => o.userId === u)?.email).filter((e): e is string => !!e), ...extra])];
  if (!a.isOwner || (a.doc.status !== "approved" && !a.execDirect)) throw new Error("Only an approved document can be sent, by its owner.");
  if (!a.doc.contact_id && !d.toContactIds?.length) throw new Error("Choose who to send to, or link a contact with an email address.");
  const team = await listClientTeam(userId, id);
  let toIds = d.toContactIds?.length ? d.toContactIds : [a.doc.contact_id as string];
  const picked = toIds.map((c) => team.find((t) => t.contactId === c));
  if (picked.some((t) => !t)) throw new Error("One of the selected recipients isn't on this client's team.");
  // Current-client contacts become CRM contacts on first send so the email is logged like any other.
  const resolved = new Map<string, string>();
  for (const t of picked as NonNullable<(typeof picked)[number]>[]) resolved.set(t.contactId, await ensureCrmContact(userId, a.db, a.doc.client_id, t));
  const to = (picked as NonNullable<(typeof picked)[number]>[]).map((t) => ({ ...t, contactId: resolved.get(t.contactId)! }));
  const rawSigners = d.signerContactIds ?? (d.toContactIds ? [] : [a.doc.contact_id as string]);
  if (rawSigners.some((s) => !toIds.includes(s))) throw new Error("Signers must be among the people you're sending to.");
  toIds = toIds.map((c) => resolved.get(c) ?? c);
  const signerIds = new Set(rawSigners.map((s) => resolved.get(s) ?? s));
  if ([...signerIds].some((s) => !toIds.includes(s))) throw new Error("Signers must be among the people you're sending to.");
  if (!signerIds.size) throw new Error("Choose at least one person who can sign.");
  const cc = ccAll.filter((e) => !to.some((t) => t.email === e));
  if (a.execDirect) {
    const now = new Date().toISOString();
    await a.db.from("sales_documents").update({ status: "approved", approved_version: a.doc.current_version, approved_by: userId, approved_at: now, updated_at: now }).eq("id", id);
    await event(a.db, id, userId, "approved", { version: a.doc.current_version, note: "Sent directly by CRO/CEO without separate approval" });
    a.doc.approved_version = a.doc.current_version; a.doc.status = "approved";
  }
  const version = a.doc.approved_version ?? a.doc.current_version;
  const key = `prop:${id}`;
  const { signProposalView, buildTrackedUrl, buildOpenPixelUrl } = await import("@/lib/email-tracking.server");
  const { acceptLinkFor } = await import("@/lib/sales-acceptance.server");
  const { sendOutreach } = await import("@/lib/sales-hub.server");
  const view = await signProposalView(id, version);
  const { proposalReadyEmail } = await import("@/lib/sales-documents-model");
  const { data: me } = await a.db.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle();
  const repName = me?.legal_name ?? null;
  const signerNames = to.filter((t) => signerIds.has(t.contactId)).map((t) => t.name);
  for (const [i, r] of to.entries()) {
    const recipient = r.email;
    const canSign = signerIds.has(r.contactId);
    const signUrl = canSign ? await acceptLinkFor(a.doc.kind, id, version, recipient) : null;
    const link = await buildTrackedUrl({ url: signUrl ?? view, recipient, template: key, label: canSign ? "Sign & approve" : "View document" });
    const pixel = await buildOpenPixelUrl({ recipient, template: key });
    const mail = proposalReadyEmail({ clientName: r.name, repMessage: d.message, repName, link, canSign, signerNames });
    const html = mail.html + `<img src="${pixel}" width="1" height="1" alt="" style="display:none"/></body></html>`;
    const body = mail.text;
    await sendOutreach(userId, { contactId: r.contactId, channel: "email", subject: d.subject, body, html, cc: i === 0 ? cc : [], visibility: "team" });
  }
  await a.db.from("sales_documents").update({ status: "sent", sent_at: new Date().toISOString(), sent_to: to.map((t) => t.email).join(", "), updated_at: new Date().toISOString() }).eq("id", id);
  await event(a.db, id, userId, "sent", { version, cc, to: to.map((t) => t.email), signers: to.filter((t) => signerIds.has(t.contactId)).map((t) => t.email) });
  return { ok: true };
}

/** The client's people who can receive this document: the linked contact, CRM contacts at the same organization,
 *  and — for current clients — the client's active saved contacts (ids prefixed "client:" until first send). */
export async function listClientTeam(userId: string, id: string) {
  const a = await access(userId, id);
  let rows: any[] = [];
  if (a.doc.contact_id) {
    const { data: main } = await a.db.from("crm_contacts").select("id, full_name, email, title, organization").eq("id", a.doc.contact_id).maybeSingle();
    rows = main ? [main] : [];
    const org = String(main?.organization ?? "").trim();
    if (org) {
      const { data } = await a.db.from("crm_contacts").select("id, full_name, email, title, organization").eq("scope", "harmonious").is("archived_at", null).ilike("organization", org).limit(50);
      rows = [...rows, ...((data ?? []) as any[]).filter((x) => x.id !== main!.id)];
    }
  }
  const out = rows.filter((x) => x.email).map((x) => ({ contactId: String(x.id), name: String(x.full_name || x.email), email: String(x.email).toLowerCase(), title: x.title ?? null }));
  if (a.doc.client_id) {
    const { data: cc } = await a.db.from("client_contacts").select("id, full_name, email, title, status, deactivated_at").eq("client_id", a.doc.client_id).is("deactivated_at", null).limit(50);
    for (const c of (cc ?? []) as any[]) {
      const email = String(c.email ?? "").trim().toLowerCase();
      if (!email || out.some((o) => o.email === email)) continue;
      const { data: crm } = await a.db.from("crm_contacts").select("id").eq("scope", "harmonious").is("archived_at", null).ilike("email", email).limit(1).maybeSingle();
      out.push({ contactId: crm?.id ? String(crm.id) : `client:${c.id}`, name: String(c.full_name || email), email, title: c.title ?? null });
    }
  }
  return out;
}

export async function addDocumentContact(userId: string, id: string, input: SalesContactInput) {
  const a = await access(userId, id);
  if (a.readOnly || !a.salesSee || !canAddSalesContact(a.doc.contact_id, a.doc.status)) throw new Error("A contact can't be added to this document.");
  const contact = await createProspect(userId, input);
  const { data: saved, error } = await a.db.from("sales_documents").update({ contact_id: contact.contactId, updated_at: new Date().toISOString() }).eq("id", id).is("contact_id", null).eq("status", a.doc.status).select("id");
  if (error || !saved?.length) throw new Error("The document changed. Refresh before adding a contact.");
  await event(a.db, id, userId, "contact_added", { contactId: contact.contactId });
  return contact;
}

/** Turns a "client:<id>" team entry into a CRM contact (reusing one with the same email) so the email can be logged. */
async function ensureCrmContact(userId: string, db: any, clientId: string, entry: { contactId: string; name: string; email: string; title: string | null }) {
  if (!entry.contactId.startsWith("client:")) return entry.contactId;
  const { data: cl } = await db.from("clients").select("name").eq("id", clientId).maybeSingle();
  const { saveContact } = await import("@/lib/crm.server");
  const r: any = await saveContact(userId, { full_name: entry.name, email: entry.email, organization: cl?.name ?? null, title: entry.title, phone: null, source: "Client contacts", tags: ["client"], scope: "harmonious", offering_id: null } as any);
  return String(r?.id ?? r?.contact?.id);
}

/** A view-only review link for the approved version, for Sales staff to share by hand. No sign button; signing still goes through the emailed per-person link. */
export async function shareLink(userId: string, id: string) {
  const a = await access(userId, id);
  if (!a.doc.approved_version) throw new Error("Approve the document first. Only an approved version can be shared.");
  const { signProposalView } = await import("@/lib/email-tracking.server");
  const url = await signProposalView(id, a.doc.approved_version);
  await event(a.db, id, userId, "link_copied", { version: a.doc.approved_version });
  return { url, version: a.doc.approved_version as number };
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
  const shown = sections.filter((s) => s.key !== "summary_note" || s.body.trim());
  const draft = !a.doc.approved_version;
  const { renderDocx } = await import("@/lib/sales-documents-render.server");
  const quoteLines = a.doc.quote_id ? ((await a.db.from("sales_quote_lines").select("label, quantity, unit_cents, line_cents, billing_frequency").eq("quote_id", a.doc.quote_id).order("sort_order")).data ?? []) : [];
  const { renderProposalPdf } = await import("@/lib/proposal-layout.server");
  const bytes = format === "pdf"
    ? await renderProposalPdf(a.doc, shown, quoteLines, draft)
    : await renderDocx(a.doc, shown, draft);
  await event(a.db, id, userId, "exported", { format, draft });
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return { base64: btoa(bin), fileName: `${a.doc.title.replace(/[^\w -]/g, "").trim() || "document"}${draft ? " (draft)" : ""}.${format}` };
}

/** Exact, normalized email lookup across CRM contacts, client contacts, clients and people. Sales staff only. */
export async function lookupProspect(userId: string, rawEmail: string) {
  const roles = await rolesOf(userId);
  if (!roles.some((r) => SALES_DOC_ROLES.includes(r))) throw new Error("Only Sales staff can look up prospects.");
  const email = rawEmail.trim().toLowerCase();
  const db = await admin();
  const [crm, cc, cl, pe] = await Promise.all([
    db.from("crm_contacts").select("id, full_name, email, organization, title, phone").eq("scope", "harmonious").is("archived_at", null).ilike("email", email).limit(1).maybeSingle(),
    db.from("client_contacts").select("id, client_id, full_name, email").ilike("email", email).limit(1).maybeSingle(),
    db.from("clients").select("id, name").or(`primary_contact_email.ilike.${email},billing_contact_email.ilike.${email}`).limit(1).maybeSingle(),
    db.from("persons").select("id, legal_first_name, legal_last_name, preferred_name").ilike("email", email).limit(1).maybeSingle(),
  ]);
  const clientId = cc.data?.client_id ?? cl.data?.id ?? null;
  const client = clientId ? (await db.from("clients").select("id, name").eq("id", clientId).maybeSingle()).data : null;
  const personName = pe.data ? (pe.data.preferred_name || [pe.data.legal_first_name, pe.data.legal_last_name].filter(Boolean).join(" ")) : null;
  const found = !!(crm.data || cc.data || cl.data || pe.data);
  return {
    email, found,
    contactId: (crm.data?.id as string | undefined) ?? null,
    name: crm.data?.full_name ?? cc.data?.full_name ?? personName ?? null,
    organization: crm.data?.organization ?? client?.name ?? null,
    clientId, clientName: client?.name ?? null,
    sources: [crm.data && "CRM contact", cc.data && "Client contact", cl.data && "Client", pe.data && "Account"].filter(Boolean) as string[],
  };
}

/** Adds a Harmonious CRM prospect, reusing an existing contact with the same email. */
export async function createProspect(userId: string, d: { email: string; fullName: string; organization?: string | null | undefined; title?: string | null | undefined; phone?: string | null | undefined }) {
  const existing = await lookupProspect(userId, d.email);
  if (existing.contactId) return { contactId: existing.contactId, reused: true };
  const { saveContact } = await import("@/lib/crm.server");
  const r = await saveContact(userId, { full_name: d.fullName, email: existing.email, organization: d.organization ?? null, title: d.title ?? null, phone: d.phone ?? null, source: "Proposals", tags: ["prospect"], scope: "harmonious", offering_id: null } as any);
  return { contactId: r.id, reused: false };
}

/** Harmonious Sales team members who may be copied on a proposal/RFP/RFQ email. Sales staff only. */
export async function listCcOptions(userId: string) {
  const { salesActor } = await import("@/lib/sales-hub.server");
  await salesActor(userId);
  const db = await admin();
  const roles = ["sales", "sales_management", "cro", "account_executive", "bdr", "account_manager", "executive"];
  const { data: r } = await db.from("user_roles").select("user_id").in("role", roles);
  const ids = [...new Set(((r ?? []) as any[]).map((x) => String(x.user_id)))];
  if (!ids.length) return [] as { userId: string; name: string; email: string }[];
  const { data: p } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids);
  const rows = ((p ?? []) as any[]).filter((x) => x.email);
  // Staff accounts without a profile row (e.g. McKay) still need to be selectable: fall back to their sign-in email.
  for (const uid of ids.filter((u) => !rows.some((x) => String(x.user_id) === u))) {
    const { data: u } = await db.auth.admin.getUserById(uid);
    const em = u?.user?.email;
    if (em) rows.push({ user_id: uid, legal_name: (u.user.user_metadata as any)?.full_name ?? null, email: em });
  }
  return rows.map((x) => ({ userId: String(x.user_id), name: String(x.legal_name || x.email), email: String(x.email).toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One personal link per person: signers get review-and-sign, everyone else view-only. Approved versions only. */
export async function personLinks(userId: string, id: string) {
  const a = await access(userId, id);
  const version = a.doc.approved_version as number | null;
  if (!version) return { version: null, people: [] as { name: string; email: string; title: string | null; role: "signer" | "viewer"; signed: boolean; signUrl: string | null; viewUrl: string }[] };
  const team = await listClientTeam(userId, id);
  const { data: sent } = await a.db.from("sales_document_events").select("detail").eq("document_id", id).eq("event", "sent").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const signerEmails = new Set<string>(((sent?.detail as any)?.signers ?? []).map((e: string) => String(e).toLowerCase()));
  const toEmails = new Set<string>(((sent?.detail as any)?.to ?? []).map((e: string) => String(e).toLowerCase()));
  if (!signerEmails.size && team[0]) signerEmails.add(team[0].email);
  const people = team.filter((t) => !toEmails.size || toEmails.has(t.email) || signerEmails.has(t.email));
  const { acceptLinkFor } = await import("@/lib/sales-acceptance.server");
  const { signProposalView } = await import("@/lib/email-tracking.server");
  const { acceptanceKey } = await import("@/lib/sales-acceptance-model");
  const viewUrl = await signProposalView(id, version);
  const { data: acc } = await a.db.from("sales_acceptances").select("signer_email").eq("acceptance_key", acceptanceKey(a.doc.kind, id, version));
  const signed = new Set(((acc ?? []) as any[]).map((r) => String(r.signer_email ?? "").toLowerCase()));
  return {
    version,
    people: await Promise.all(people.map(async (t) => {
      const isSigner = signerEmails.has(t.email);
      return { name: t.name, email: t.email, title: t.title, role: (isSigner ? "signer" : "viewer") as "signer" | "viewer", signed: signed.has(t.email),
        signUrl: isSigner ? await acceptLinkFor(a.doc.kind, id, version, t.email) : null, viewUrl };
    })),
  };
}

export async function logLinkCopy(userId: string, id: string, email: string, kind: "sign" | "view") {
  const a = await access(userId, id);
  await event(a.db, id, userId, "link_copied", { version: a.doc.approved_version, email, kind });
  return { ok: true };
}
