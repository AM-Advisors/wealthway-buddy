import { canEnterMigratedBilling } from "./migrated-billing-model";

/** Executive-authorized historical receipt snapshot; never settles an invoice. */
export async function recordReceiptTotal(userId: string, d: { invoiceId: string; paidCents: number; paidOn: string; method: string; reference: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (roleError || !canEnterMigratedBilling((roles ?? []).map((r: any) => r.role))) throw new Error("Executive billing authority is required.");
  const { data: inv, error } = await db.from("invoices").select("id, client_id, total_cents, status, issue_date").eq("id", d.invoiceId).maybeSingle();
  if (error || !inv || inv.status !== "issued") throw new Error("Only an issued invoice can receive a receipt total.");
  if (!Number.isSafeInteger(d.paidCents) || d.paidCents <= 0 || d.paidCents >= Number(inv.total_cents)) throw new Error("Record a partial receipt below the invoice total.");
  if (d.paidOn > new Date().toISOString().slice(0, 10) || d.paidOn < inv.issue_date || !d.reference.trim()) throw new Error("Provide the receipt date and source reference.");
  const { data: latest, error: readError } = await db.from("billing_record_events").select("detail").eq("entity_kind", "invoice").eq("entity_id", inv.id).eq("event_kind", "receipt_total_recorded").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (readError) throw new Error("Couldn't check existing receipt totals.");
  if (latest?.detail?.paid_cents === d.paidCents && latest.detail.reference === d.reference) return { ok: true };
  const { error: saveError } = await db.from("billing_record_events").insert({ entity_kind: "invoice", entity_id: inv.id, client_id: inv.client_id, actor_id: userId, event_kind: "receipt_total_recorded", detail: { paid_cents: d.paidCents, paid_on: d.paidOn, method: d.method, reference: d.reference } });
  if (saveError) throw new Error("Couldn't record the receipt total.");
  return { ok: true };
}