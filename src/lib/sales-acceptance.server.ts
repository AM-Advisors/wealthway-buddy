/** Server-only: client sign-and-approve for quotes/proposals/RFPs/RFQs, automatic invoice, and audited Harmonious payment instructions.
 *  Records only — nothing is charged, pulled or wired. */
import {
  acceptanceKey, clientRemittance, invoiceLinesFromQuote, remittanceApprovalBlocker, signBlocker, signerBlocker, type AcceptKind,
} from "@/lib/sales-acceptance-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const STAFF = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance", "finance", "client_success", "executive", "cro", "sales", "sales_management", "account_executive", "bdr", "account_manager", "leadership", "tax"];
const REMIT_EDITORS = ["admin", "super_admin", "finance", "executive", "legal", "compliance"];

async function rolesOf(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Loaded = {
  kind: AcceptKind; id: string; version: number; title: string; clientId: string | null; offeringId: string | null; quoteId: string | null;
  ownerId: string | null; dealId: string | null; status: string; approvedVersion: number | null; recipientEmail: string | null;
  sections: { title: string; body: string }[]; lines: any[];
};

async function loadRecord(db: any, kind: AcceptKind, id: string): Promise<Loaded> {
  if (kind === "quote") {
    const { data: q } = await db.from("sales_quotes").select("*").eq("id", id).maybeSingle();
    if (!q) throw new Error("This link is no longer valid.");
    const { data: lines } = await db.from("sales_quote_lines").select("*").eq("quote_id", id).order("sort_order");
    const { data: c } = q.contact_id ? await db.from("crm_contacts").select("email").eq("id", q.contact_id).maybeSingle() : { data: null };
    return { kind, id, version: q.version ?? 1, title: q.title || `Quote Q-${q.quote_number}`, clientId: q.client_id, offeringId: q.offering_id ?? null, quoteId: q.id,
      ownerId: q.owner_user_id, dealId: q.deal_id, status: q.status, approvedVersion: q.version ?? 1, recipientEmail: c?.email ?? null,
      sections: q.notes ? [{ title: "Notes", body: q.notes }] : [], lines: lines ?? [] };
  }
  const { data: d } = await db.from("sales_documents").select("*").eq("id", id).maybeSingle();
  if (!d || d.kind !== kind) throw new Error("This link is no longer valid.");
  const v = d.approved_version ?? d.current_version;
  const { data: ver } = await db.from("sales_document_versions").select("sections").eq("document_id", id).eq("version", v).maybeSingle();
  const { data: q } = d.quote_id ? await db.from("sales_quotes").select("offering_id, client_id").eq("id", d.quote_id).maybeSingle() : { data: null };
  const { data: lines } = d.quote_id ? await db.from("sales_quote_lines").select("*").eq("quote_id", d.quote_id).order("sort_order") : { data: [] };
  return { kind, id, version: v, title: d.title, clientId: d.client_id ?? q?.client_id ?? null, offeringId: q?.offering_id ?? null, quoteId: d.quote_id,
    ownerId: d.owner_user_id, dealId: d.deal_id, status: d.status, approvedVersion: d.approved_version, recipientEmail: d.sent_to ?? d.recipient_email ?? null,
    sections: ((ver?.sections ?? []) as any[]).filter((s) => s.key !== "summary_note" || String(s.body ?? "").trim()).map((s) => ({ title: String(s.title ?? ""), body: String(s.body ?? "") })),
    lines: lines ?? [] };
}

async function fromToken(token: string) {
  const { verifyAcceptToken } = await import("@/lib/email-tracking.server");
  const t = await verifyAcceptToken(token);
  if (!t || !["quote", "proposal", "rfp", "rfq"].includes(t.kind)) throw new Error("This link is no longer valid.");
  return t as { kind: AcceptKind; id: string; version: number; email: string };
}

async function acceptanceFor(db: any, key: string) {
  const { data } = await db.from("sales_acceptances").select("*").eq("acceptance_key", key).maybeSingle();
  return data as any;
}

/** Build the client link for an approved record (staff side). */
export async function acceptLinkFor(kind: AcceptKind, id: string, version: number, email: string) {
  const { signAcceptToken, TRACKING_BASE } = await import("@/lib/email-tracking.server");
  return `${TRACKING_BASE}/accept/${encodeURIComponent(await signAcceptToken({ kind, id, version, email }))}`;
}

/** What the client sees on the sign page. Token-gated; no bank details here. */
export async function viewForToken(token: string) {
  const t = await fromToken(token);
  const db = await admin();
  const r = await loadRecord(db, t.kind, t.id);
  const acc = await acceptanceFor(db, acceptanceKey(t.kind, t.id, t.version));
  const { data: client } = r.clientId ? await db.from("clients").select("name, legal_name").eq("id", r.clientId).maybeSingle() : { data: null };
  const { data: inv } = acc?.invoice_id ? await db.from("invoices").select("id, number, total_cents, due_date, status").eq("id", acc.invoice_id).maybeSingle() : { data: null };
  const lines = invoiceLinesFromQuote(r.lines);
  return {
    kind: r.kind, title: r.title, version: t.version, clientName: client?.legal_name || client?.name || null,
    stale: r.kind !== "quote" && r.approvedVersion !== t.version,
    blocker: acc ? null : signBlocker(r.kind, r.status, r.approvedVersion, t.version),
    sections: r.sections, lines: lines.map((l) => ({ label: l.label, quantity: l.quantity, amountCents: l.amount_cents })),
    totalCents: lines.reduce((s, l) => s + l.amount_cents, 0),
    accepted: acc ? { signerName: acc.signer_name, acceptedAt: acc.accepted_at, paymentMethod: acc.payment_method, invoiceError: acc.invoice_error } : null,
    invoice: inv ? { number: inv.number, totalCents: Number(inv.total_cents), dueDate: inv.due_date, status: inv.status } : null,
  };
}

async function createInvoiceFromAcceptance(db: any, r: Loaded, acc: any) {
  const lines = invoiceLinesFromQuote(r.lines);
  if (!r.clientId) return { error: "No client account is linked yet; Harmonious will issue the invoice." };
  if (!lines.length) return { error: "No priced quote is linked; Harmonious will issue the invoice." };
  const key = acceptanceKey(r.kind, r.id, r.version);
  const { data: existing } = await db.from("invoices").select("id, number").eq("acceptance_key", key).maybeSingle();
  if (existing) return { id: existing.id, number: existing.number };
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const total = lines.reduce((s, l) => s + l.amount_cents, 0);
  const year = today.slice(0, 4);
  let inserted: any = null;
  for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
    const { count } = await db.from("invoices").select("id", { count: "exact", head: true }).not("number", "is", null).like("number", `HRM-${year}-%`);
    const number = `HRM-${year}-${String((count ?? 0) + 1 + attempt).padStart(4, "0")}`;
    const { data, error } = await db.from("invoices").insert({
      client_id: r.clientId, offering_id: r.offeringId, sales_quote_id: r.quoteId, sales_document_id: r.kind === "quote" ? null : r.id, acceptance_key: key,
      number, status: "issued", issue_date: today, due_date: due, net_days: 30, period_start: today, period_end: today, total_cents: total,
      note: `Issued automatically when ${acc.signer_name} signed ${r.title} (version ${r.version}).`,
      issued_at: new Date().toISOString(), approval_status: "approved", client_approved_at: acc.accepted_at, client_signer_name: acc.signer_name,
      client_approved_by: acc.signer_user_id ?? null, client_payment_method: acc.payment_method ?? null, created_by: r.ownerId, issued_by: r.ownerId,
    }).select("id, number").single();
    if (!error) inserted = data;
    else if (error.code === "23505" && String(error.message).includes("acceptance_key")) {
      const { data: again } = await db.from("invoices").select("id, number").eq("acceptance_key", key).maybeSingle();
      return { id: again.id, number: again.number };
    } else if (error.code !== "23505") { console.error("auto invoice failed", error); return { error: "Harmonious will issue the invoice shortly." }; }
  }
  if (!inserted) return { error: "Harmonious will issue the invoice shortly." };
  const { error: le } = await db.from("invoice_lines").insert(lines.map((l) => ({ ...l, invoice_id: inserted.id, offering_id: r.offeringId })));
  if (le) console.error("auto invoice lines failed", le);
  return { id: inserted.id as string, number: inserted.number as string, totalCents: total, dueDate: due };
}

/** Client signs & approves. Idempotent: signing twice never creates a second acceptance or invoice. */
export async function acceptByToken(d: { token: string; signerName: string; signerTitle?: string | null; agree: boolean; paymentMethod: "card" | "wire" | "ach"; ip: string | null; ua: string | null; userId?: string | null }) {
  if (!d.agree) throw new Error("Tick the box to approve and agree.");
  if (d.signerName.trim().length < 2) throw new Error("Type your full name to sign.");
  const t = await fromToken(d.token);
  const db = await admin();
  const r = await loadRecord(db, t.kind, t.id);
  const key = acceptanceKey(t.kind, t.id, t.version);
  const prior = await acceptanceFor(db, key);
  if (!prior) {
    const blocked = signBlocker(r.kind, r.status, r.approvedVersion, t.version);
    if (blocked) throw new Error(blocked);
    if (d.userId) {
      const roles = await rolesOf(db, d.userId);
      const { data: m } = r.clientId ? await db.from("client_users").select("id").eq("client_id", r.clientId).eq("user_id", d.userId).is("revoked_at", null).maybeSingle() : { data: null };
      const sb = signerBlocker({ isStaff: roles.some((x) => STAFF.includes(x)), isClientMember: !!m, viaLink: true });
      if (sb) throw new Error(sb);
    }
  }
  let acc = prior;
  if (!acc) {
    const hash = await sha256(JSON.stringify({ k: r.kind, i: r.id, v: t.version, s: r.sections, l: r.lines.map((l) => [l.label, l.quantity, l.line_cents]) }));
    const { data, error } = await db.from("sales_acceptances").insert({
      kind: r.kind, sales_document_id: r.kind === "quote" ? null : r.id, sales_quote_id: r.quoteId, version: t.version, client_id: r.clientId,
      signer_name: d.signerName.trim().slice(0, 160), signer_title: d.signerTitle?.trim().slice(0, 160) || null, signer_email: t.email || null,
      signer_user_id: d.userId ?? null, via: d.userId ? "portal" : "link", content_hash: hash, ip: d.ip, user_agent: d.ua?.slice(0, 400) ?? null,
      payment_method: d.paymentMethod, acceptance_key: key,
    }).select("*").single();
    if (error) {
      if (error.code === "23505") acc = await acceptanceFor(db, key);
      else { console.error("acceptance insert", error); throw new Error("We couldn't record your signature. Please try again."); }
    } else acc = data;
    const now = new Date().toISOString();
    if (r.quoteId) await db.from("sales_quotes").update({ status: "signed", signed_at: now, updated_at: now }).eq("id", r.quoteId).in("status", ["approved", "sent"]);
    if (r.kind !== "quote") await db.from("sales_documents").update({ status: "won", updated_at: now }).eq("id", r.id).then(() => null, () => null);
    if (r.dealId) {
      await db.from("crm_deals").update({ sales_stage: "contract_won", stage_changed_at: now }).eq("id", r.dealId);
      await db.from("sales_stage_events").insert({ deal_id: r.dealId, to_stage: "contract_won", note: `Client signed ${r.title}`, actor_id: null }).then(() => null, () => null);
    }
  }
  if (!acc.invoice_id) {
    const inv = await createInvoiceFromAcceptance(db, r, acc);
    if ("id" in inv && inv.id) {
      await db.from("sales_acceptances").update({ invoice_id: inv.id, invoice_error: null }).eq("id", acc.id);
      acc.invoice_id = inv.id;
      if (!prior) await notifyAfterSign(db, r, acc, inv as any);
    } else await db.from("sales_acceptances").update({ invoice_error: (inv as any).error }).eq("id", acc.id);
  }
  return viewForToken(d.token);
}

async function notifyAfterSign(db: any, r: Loaded, acc: any, inv: { id: string; number: string; totalCents?: number; dueDate?: string }) {
  try {
    const { notifyClientAdminsWith, money, CLIENT_PORTAL_BASE } = await import("@/lib/client-notify.server");
    const { data: billed } = await db.from("invoice_lines").select("label, amount_cents").eq("invoice_id", inv.id).order("sort_order");
    const { data: c } = await db.from("clients").select("legal_name, name").eq("id", r.clientId).maybeSingle();
    await notifyClientAdminsWith(r.clientId, "invoice-issued", `invoice-issued:${inv.id}`, (p) => ({
      contactName: p.name, clientName: c?.legal_name || c?.name || "your organization", invoiceNumber: inv.number, amount: money(inv.totalCents ?? 0),
      issueDate: new Date().toISOString().slice(0, 10), dueDate: inv.dueDate ?? "", periodLabel: `Signed ${r.title}`,
      lines: (billed ?? []).map((l: any) => ({ label: String(l.label), amount: money(Number(l.amount_cents)) })),
      payUrl: `${CLIENT_PORTAL_BASE}/client/invoices?invoice=${inv.id}`, note: "",
    }));
    if (r.ownerId) {
      const { data: owner } = await db.from("profiles").select("email").eq("user_id", r.ownerId).maybeSingle();
      if (owner?.email) {
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        await sendTemplateEmail("crm-campaign", owner.email, { idempotencyKey: `accept-owner:${acc.id}`, templateData: {
          subject: `Signed: ${r.title}`, body: `${acc.signer_name} signed and approved ${r.title} (version ${r.version}). Invoice ${inv.number} was issued automatically. Payment method chosen: ${acc.payment_method ?? "not chosen"}.`, fundName: null } });
      }
    }
  } catch (e) { console.error("accept notify failed", e); }
}

/** Approved Harmonious wire/ACH details, masked unless revealed. Every read is logged. */
async function remittanceRead(db: any, method: "wire" | "ach", reveal: boolean, log: { invoiceId: string | null; userId: string | null; email: string | null; via: string; ip: string | null }) {
  const { data } = await db.from("harmonious_remittance_versions").select("*").eq("method", method).eq("status", "approved").maybeSingle();
  const shown = clientRemittance(data, reveal);
  await db.from("remittance_view_events").insert({ remittance_version_id: data?.id ?? null, invoice_id: log.invoiceId, viewer_user_id: log.userId, viewer_email: log.email, via: log.via, revealed: reveal && !!shown, ip: log.ip });
  if (!shown) return null;
  return { method: shown.method, bankName: shown.bank_name, accountName: shown.account_name, accountNumber: shown.account_number, routingNumber: shown.routing_number,
    swiftCode: shown.swift_code, bankAddress: shown.bank_address, beneficiaryAddress: shown.beneficiary_address, referenceNote: shown.reference_note, revealed: reveal };
}

export async function remittanceByToken(d: { token: string; method: "wire" | "ach"; reveal: boolean; ip: string | null }) {
  const t = await fromToken(d.token);
  const db = await admin();
  const acc = await acceptanceFor(db, acceptanceKey(t.kind, t.id, t.version));
  if (!acc?.invoice_id) throw new Error("Sign first to see payment instructions.");
  const { data: inv } = await db.from("invoices").select("number").eq("id", acc.invoice_id).maybeSingle();
  const r = await remittanceRead(db, d.method, d.reveal, { invoiceId: acc.invoice_id, userId: null, email: t.email, via: "link", ip: d.ip });
  return { reference: inv?.number ?? null, instructions: r };
}

export async function remittanceForInvoice(userId: string, d: { invoiceId: string; method: "wire" | "ach"; reveal: boolean; ip: string | null }) {
  const db = await admin();
  const { data: inv } = await db.from("invoices").select("id, number, client_id, status").eq("id", d.invoiceId).maybeSingle();
  if (!inv || inv.status === "draft") throw new Error("That invoice isn't available.");
  const { data: m } = await db.from("client_users").select("id").eq("client_id", inv.client_id).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (!m) throw new Error("That invoice isn't available.");
  const r = await remittanceRead(db, d.method, d.reveal, { invoiceId: inv.id, userId, email: null, via: "portal", ip: d.ip });
  return { reference: inv.number, instructions: r };
}

// ---- Staff: payment instruction versions (maker-checker) ----
async function remitEditor(db: any, userId: string) {
  const roles = await rolesOf(db, userId);
  if (!roles.some((r) => REMIT_EDITORS.includes(r))) throw new Error("Only Finance, Legal, Compliance, the CEO or admins can manage payment instructions.");
  return roles;
}
export async function listRemittance(userId: string) {
  const db = await admin(); await remitEditor(db, userId);
  const { data } = await db.from("harmonious_remittance_versions").select("*").order("prepared_at", { ascending: false }).limit(50);
  const { data: views } = await db.from("remittance_view_events").select("via, revealed, occurred_at, invoice_id").order("occurred_at", { ascending: false }).limit(20);
  return { versions: ((data ?? []) as any[]).map((r) => ({ ...clientRemittance({ ...r, status: "approved" }, false)!, status: r.status })), recentViews: views ?? [] };
}
export async function prepareRemittance(userId: string, d: { method: "wire" | "ach"; bankName: string; accountName: string; accountNumber: string; routingNumber: string; swiftCode?: string | null; bankAddress?: string | null; beneficiaryAddress?: string | null; referenceNote?: string | null }) {
  const db = await admin(); await remitEditor(db, userId);
  const { error } = await db.from("harmonious_remittance_versions").insert({ method: d.method, bank_name: d.bankName, account_name: d.accountName, account_number: d.accountNumber.replace(/\s+/g, ""),
    routing_number: d.routingNumber.replace(/\s+/g, ""), swift_code: d.swiftCode || null, bank_address: d.bankAddress || null, beneficiary_address: d.beneficiaryAddress || null, reference_note: d.referenceNote || null, prepared_by: userId });
  if (error) throw new Error(error.message);
  return { ok: true };
}
export async function decideRemittance(userId: string, d: { id: string; approve: boolean; reason?: string | null }) {
  const db = await admin(); const roles = await remitEditor(db, userId);
  const { data: row } = await db.from("harmonious_remittance_versions").select("*").eq("id", d.id).maybeSingle();
  if (!row || row.status !== "draft") throw new Error("Only a waiting version can be decided.");
  if (!d.approve) { await db.from("harmonious_remittance_versions").update({ status: "rejected" }).eq("id", d.id); return { ok: true }; }
  const blocked = remittanceApprovalBlocker({ approverId: userId, preparedBy: row.prepared_by, isSuperAdmin: roles.includes("super_admin"), reason: d.reason });
  if (blocked) throw new Error(blocked);
  const now = new Date().toISOString();
  await db.from("harmonious_remittance_versions").update({ status: "retired", retired_at: now }).eq("method", row.method).eq("status", "approved");
  const { error } = await db.from("harmonious_remittance_versions").update({ status: "approved", approved_by: userId, approved_at: now, self_approval_reason: userId === row.prepared_by ? d.reason : null }).eq("id", d.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Staff copies a client sign link for an approved quote. */
export async function quoteAcceptLink(userId: string, quoteId: string) {
  const { salesActor } = await import("@/lib/sales-hub.server");
  const a = await salesActor(userId);
  const db = await admin();
  const r = await loadRecord(db, "quote", quoteId);
  if (a.visible && !a.visible.includes(r.ownerId ?? "")) throw new Error("That quote isn't yours.");
  const blocked = signBlocker("quote", r.status, r.approvedVersion, r.version);
  if (blocked) throw new Error(blocked);
  if (!r.recipientEmail) throw new Error("Link a contact with an email address first.");
  return { url: await acceptLinkFor("quote", quoteId, r.version, r.recipientEmail) };
}
