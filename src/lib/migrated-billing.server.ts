/**
 * Migrated client billing (CEO, CRO, Super Admin only): past fees, invoices and payments
 * received, the statement of work behind them, and handing the paid amounts to commissions.
 * Records only: nothing is charged, collected or paid out.
 */
import { buildSowSections } from "@/lib/agreement-templates";
import { MIGRATED_BILLING_ROLES, canPushToCommissions } from "@/lib/migrated-billing-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const today = () => new Date().toISOString().slice(0, 10);
const SALES_ROLES = ["sales", "account_executive", "bdr", "sales_management", "cro", "executive"];

async function actor(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => MIGRATED_BILLING_ROLES.includes(r))) throw new Error("Only the CEO, CRO or a Super Admin can enter migrated fees and invoices.");
  return { db, roles };
}

async function fund(db: any, fundId: string) {
  const { data: o } = await db.from("offerings").select("id, name, client_id").eq("id", fundId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  if (!o.client_id) throw new Error("Link this fund to a client before adding fees.");
  const { data: c } = await db.from("clients").select("id, name, legal_name").eq("id", o.client_id).maybeSingle();
  return { fund: o, clientName: (c?.legal_name || c?.name || "Client") as string };
}

const log = (db: any, entityId: string, clientId: string, actorId: string, kind: string, detail: unknown) =>
  db.from("billing_record_events").insert({ entity_kind: "migrated_billing", entity_id: entityId, client_id: clientId, actor_id: actorId, event_kind: kind, detail });

export async function overview(userId: string, fundId: string) {
  const { db, roles } = await actor(userId);
  const { fund: f } = await fund(db, fundId);
  const [{ data: invoices }, { data: links }, { data: roleRows }] = await Promise.all([
    db.from("invoices").select("id, number, status, total_cents, issue_date, paid_on, sow_id, sales_quote_id, note, created_by").eq("offering_id", fundId).order("issue_date", { ascending: false }),
    db.from("client_sow_funds").select("sow_id").eq("offering_id", fundId).is("removed_at", null),
    db.from("user_roles").select("user_id, role").in("role", SALES_ROLES),
  ]);
  const sowIds = ((links ?? []) as any[]).map((l) => l.sow_id);
  const { data: sows } = sowIds.length ? await db.from("client_sows").select("id, title, stage, executed_at, client_signed_at, document_path, legacy_activation").in("id", sowIds) : { data: [] };
  const repIds = [...new Set(((roleRows ?? []) as any[]).map((r) => r.user_id))];
  const { data: profs } = repIds.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", repIds) : { data: [] };
  return {
    clientId: f.client_id as string,
    invoices: ((invoices ?? []) as any[]).filter((i) => i.status !== "void"),
    sows: (sows ?? []) as any[],
    reps: ((profs ?? []) as any[]).map((p) => ({ id: p.user_id as string, name: (p.legal_name || p.email || "Team member") as string })),
    canSelfApprove: roles.includes("super_admin"),
  };
}

type Line = { label: string; amountCents: number };

/** A past invoice (issued, or paid on a past date) for this fund's client. */
export async function recordInvoice(userId: string, d: { fundId: string; lines: Line[]; issueDate: string; paidOn?: string | null; reference?: string | null; note?: string | null; sowId?: string | null }) {
  const { db } = await actor(userId);
  const { fund: f } = await fund(db, d.fundId);
  if (d.issueDate > today()) throw new Error("The invoice date can't be in the future.");
  if (d.paidOn && d.paidOn > today()) throw new Error("The payment date can't be in the future.");
  if (d.paidOn && d.paidOn < d.issueDate) throw new Error("The payment date can't be before the invoice date.");
  const total = d.lines.reduce((s, l) => s + l.amountCents, 0);
  if (total <= 0) throw new Error("Add at least one fee with an amount.");
  const year = d.issueDate.slice(0, 4);
  const { count } = await db.from("invoices").select("id", { count: "exact", head: true }).like("number", `HRM-M${year}-%`);
  const number = `HRM-M${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
  const { data: inv, error } = await db.from("invoices").insert({
    client_id: f.client_id, offering_id: f.id, sow_id: d.sowId ?? null, number, status: d.paidOn ? "paid" : "issued",
    issue_date: d.issueDate, due_date: d.issueDate, net_days: 0, period_start: d.issueDate, period_end: d.issueDate, total_cents: total,
    paid_on: d.paidOn ?? null, payment_reference: d.reference || null, note: `Migrated record${d.note ? `: ${d.note}` : ""}`,
    issued_at: new Date(d.issueDate + "T12:00:00Z").toISOString(), issued_by: userId, created_by: userId,
  }).select("id, number").single();
  if (error) { console.error("migrated invoice failed", error); throw new Error("Couldn't save the invoice."); }
  const { error: le } = await db.from("invoice_lines").insert(d.lines.map((l, i) => ({ invoice_id: inv.id, offering_id: f.id, source: "manual", label: l.label, quantity: 1, unit_cents: l.amountCents, amount_cents: l.amountCents, sort_order: i, source_ref: "migration" })));
  if (le) console.error("migrated invoice lines failed", le);
  await log(db, inv.id, f.client_id, userId, "invoice_recorded", { number, total_cents: total, issue_date: d.issueDate, paid_on: d.paidOn ?? null });
  return { id: inv.id as string, number: inv.number as string };
}

export async function recordPayment(userId: string, d: { invoiceId: string; paidOn: string; reference?: string | null }) {
  const { db } = await actor(userId);
  const { data: inv } = await db.from("invoices").select("id, client_id, status, issue_date").eq("id", d.invoiceId).maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "issued") throw new Error("Only an unpaid invoice can be marked paid.");
  if (d.paidOn > today()) throw new Error("The payment date can't be in the future.");
  await db.from("invoices").update({ status: "paid", paid_on: d.paidOn, payment_reference: d.reference || null }).eq("id", d.invoiceId);
  await log(db, d.invoiceId, inv.client_id, userId, "payment_recorded", { paid_on: d.paidOn, reference: d.reference || null });
  return { ok: true };
}

/** Generates a statement of work from the fees, assigns it to the fund, puts it on the client's list and emails them. */
export async function generateSow(userId: string, d: { fundId: string; title: string; lines: Line[]; invoiceId?: string | null }) {
  const { db } = await actor(userId);
  const { fund: f, clientName } = await fund(db, d.fundId);
  if (!d.lines.length) throw new Error("Add at least one fee.");
  const { data: msaVersion } = await db.from("msa_versions").select("id, version").eq("status", "published").order("effective_date", { ascending: false }).limit(1).maybeSingle();
  const { data: sow, error } = await db.from("client_sows").insert({
    client_id: f.client_id, offering_id: f.id, title: d.title || `${f.name} services`, sow_type: "services", status: "draft", stage: "in_review",
    created_by: userId, msa_version_id: msaVersion?.id ?? null, generated_automatically: true, notes: "Generated from migrated fees",
    generated_lines: d.lines.map((l) => ({ label: l.label, quantity: 1, unit_cents: l.amountCents, amount_cents: l.amountCents, billing_frequency: "one_time" })),
  }).select("id").single();
  if (error) { console.error("migrated SOW failed", error); throw new Error("Couldn't create the statement of work."); }
  const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const sections = buildSowSections({ clientName, fundName: f.name, effectiveDate: today(), msaVersion: msaVersion?.version ?? "in force", pricingVersion: "Agreed fees", noticeDays: 60, services: d.lines.map((l) => ({ label: l.label, description: usd(l.amountCents) })) });
  await db.from("sow_sections").insert(sections.map((s: any) => ({ sow_id: sow.id, section_no: s.section_no, key: s.key, title: s.title, body: s.body, sort_order: s.sort_order })));
  await db.from("client_sow_funds").insert({ sow_id: sow.id, offering_id: f.id, client_id: f.client_id, added_by: userId, reason: "Migrated fees" });
  if (d.invoiceId) await db.from("invoices").update({ sow_id: sow.id }).eq("id", d.invoiceId).is("sow_id", null);
  await log(db, sow.id, f.client_id, userId, "sow_generated", { title: d.title, fund_id: f.id });
  const emailed = await emailClient(db, f.client_id, sow.id, d.title || `${f.name} services`, f.name);
  return { sowId: sow.id as string, emailed };
}

async function emailClient(db: any, clientId: string, sowId: string, title: string, fundName: string) {
  const { data: cu } = await db.from("client_users").select("user_id").eq("client_id", clientId).is("revoked_at", null);
  const ids = ((cu ?? []) as any[]).map((r) => r.user_id);
  if (!ids.length) return 0;
  const { data: profs } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids);
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const origin = process.env["SITE_URL"] || "https://app.harmonious.co";
  let n = 0;
  for (const p of (profs ?? []) as any[]) {
    if (!p.email) continue;
    try {
      const r: any = await sendTemplateEmail("sow-ready", p.email, { idempotencyKey: `sow-ready-${sowId}-${p.user_id}`, templateData: { contactName: p.legal_name || undefined, title, fundName, url: `${origin}/client/agreements/sow/${sowId}` } });
      if (r?.sent !== false) n += 1;
    } catch (e) { console.warn("SOW email failed", e); }
  }
  return n;
}

/** Stores a previously signed statement of work as executed and assigns it to the fund. */
export async function uploadSow(userId: string, d: { fundId: string; title: string; signedOn: string; signedBy?: string | null; fileName: string; base64: string; invoiceId?: string | null }) {
  const { db } = await actor(userId);
  const { fund: f } = await fund(db, d.fundId);
  if (d.signedOn > today()) throw new Error("The signed date can't be in the future.");
  if (!/\.pdf$/i.test(d.fileName)) throw new Error("Upload the signed statement of work as a PDF.");
  const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("The file is larger than 20 MB.");
  const path = `sows/${f.client_id}/migrated-${crypto.randomUUID()}.pdf`;
  const { error: ue } = await db.storage.from("fund-formation").upload(path, bytes, { contentType: "application/pdf" });
  if (ue) { console.error("SOW upload failed", ue); throw new Error("Couldn't upload the file."); }
  const at = new Date(d.signedOn + "T12:00:00Z").toISOString();
  const { data: sow, error } = await db.from("client_sows").insert({
    client_id: f.client_id, offering_id: f.id, title: d.title || `${f.name} services (signed before Harmonious platform)`, sow_type: "services",
    status: "active", stage: "executed", approval_status: "approved", client_status: "approved", document_path: path, signed_by: d.signedBy || null, signed_on: d.signedOn,
    effective_date: d.signedOn, executed_at: at, locked: true, legacy_activation: true, created_by: userId, notes: `Previously signed copy uploaded (${d.fileName})`,
  }).select("id").single();
  if (error) { console.error("migrated SOW insert failed", error); throw new Error("Couldn't save the statement of work."); }
  await db.from("client_sow_funds").insert({ sow_id: sow.id, offering_id: f.id, client_id: f.client_id, added_by: userId, reason: "Previously signed SOW uploaded" });
  if (d.invoiceId) await db.from("invoices").update({ sow_id: sow.id }).eq("id", d.invoiceId).is("sow_id", null);
  await log(db, sow.id, f.client_id, userId, "sow_uploaded", { file: d.fileName, signed_on: d.signedOn, fund_id: f.id });
  return { sowId: sow.id as string };
}

/** Hands a paid migrated invoice to the commission engine by recording the sale it came from. */
export async function pushToCommissions(userId: string, d: { invoiceId: string; repUserId: string }) {
  const { db } = await actor(userId);
  const { data: inv } = await db.from("invoices").select("id, client_id, offering_id, sow_id, sales_quote_id, status, paid_on, issue_date, total_cents, number, created_by").eq("id", d.invoiceId).maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  if (inv.sales_quote_id) throw new Error("This invoice is already in commissions.");
  const problem = canPushToCommissions({ actorId: userId, recordedBy: inv.created_by, isSuperAdmin: false });
  if (problem && !(await (await import("@/lib/self-approval.server")).selfApprove(userId, "migrated_commission_push", [d.invoiceId]))) throw new Error(problem);
  const { data: lines } = await db.from("invoice_lines").select("label, service_key, amount_cents, sort_order").eq("invoice_id", inv.id).order("sort_order");
  const at = new Date((inv.paid_on ?? inv.issue_date ?? today()) + "T12:00:00Z").toISOString();
  const { data: q, error } = await db.from("sales_quotes").insert({
    title: `Migrated invoice ${inv.number}`, client_id: inv.client_id, offering_id: inv.offering_id, owner_user_id: d.repUserId, created_by: userId,
    status: "signed", total_cents: inv.total_cents, baseline_cents: inv.total_cents, approved_by: userId, approved_at: at, signed_at: at, sow_id: inv.sow_id,
    notes: "Recorded from a migrated invoice so commissions can be calculated.",
  }).select("id").single();
  if (error) { console.error("commission push failed", error); throw new Error("Couldn't send this invoice to commissions."); }
  await db.from("sales_quote_lines").insert(((lines ?? []) as any[]).map((l, i) => ({ quote_id: q.id, service_key: l.service_key ?? "migrated", label: l.label, quantity: 1, unit_cents: l.amount_cents, baseline_unit_cents: l.amount_cents, line_cents: l.amount_cents, sort_order: i, billing_frequency: "one_time" })));
  await db.from("sales_quote_events").insert({ quote_id: q.id, event: "migrated_to_commissions", actor_id: userId, note: `Invoice ${inv.number}` });
  await db.from("invoices").update({ sales_quote_id: q.id }).eq("id", inv.id);
  if (inv.status === "paid" && inv.sow_id) await (await import("@/lib/commissions.server")).queueInvoicePayouts(inv.id).catch((e: unknown) => console.warn("payout queue skipped", e));
  await log(db, inv.id, inv.client_id, userId, "pushed_to_commissions", { rep_user_id: d.repUserId, quote_id: q.id });
  return { quoteId: q.id as string };
}
