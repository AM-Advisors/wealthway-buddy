import type { FeeTarget } from "./invoice-fee-accounting";
import { feeEligible, feeTargetError } from "./invoice-fee-accounting";

export async function readFeeAccounting(context: any, invoiceId?: string) {
  let query = context.supabase.from("invoices").select("id,client_id,number,status,issue_date,due_date,offering_id,invoice_lines(id,label,amount_cents,offering_id,service_key)").in("status", ["issued", "paid"]).order("issue_date", { ascending: false }).limit(300);
  if (invoiceId) query = query.eq("id", invoiceId);
  const { data: invoices, error } = await query;
  if (error) throw new Error("Couldn't load invoice fees. Please retry.");
  const clientIds = [...new Set((invoices ?? []).map((i: any) => i.client_id))];
  if (!clientIds.length) return { targets: [], rows: [] };
  const [{ data: funds, error: fundError }, { data: companies, error: companyError }] = await Promise.all([
    context.supabase.from("offerings").select("id,client_id,name").in("client_id", clientIds),
    context.supabase.from("client_entities").select("id,client_id,legal_name,status").in("client_id", clientIds),
  ]);
  if (fundError || companyError) throw new Error("Couldn't load fund and company assignments. Please retry.");
  const targets: FeeTarget[] = [...(funds ?? []).map((f: any) => ({ ...f, kind: "fund" as const })), ...(companies ?? []).map((c: any) => ({ id: c.id, client_id: c.client_id, name: c.legal_name, kind: "company" as const }))];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const lines = (invoices ?? []).flatMap((i: any) => i.invoice_lines ?? []);
  const ids = lines.map((l: any) => l.id);
  if (!ids.length) return { targets, rows: [] };
  const [{ data: events, error: eventError }, { data: journals, error: journalError }] = await Promise.all([
    supabaseAdmin.from("billing_record_events").select("entity_id,client_id,detail,created_at").eq("entity_kind", "invoice_line").eq("event_kind", "accounting_target_linked").in("entity_id", ids).order("created_at", { ascending: false }),
    supabaseAdmin.from("journal_entries").select("id,source_id,status").eq("source_table", "invoice_lines").in("source_id", ids).neq("status", "voided"),
  ]);
  if (eventError || journalError) throw new Error("Couldn't load fee accounting history. Please retry.");
  const rows = (invoices ?? []).flatMap((inv: any) => (inv.invoice_lines ?? []).filter((line: any) => feeEligible(inv.status, { ...line, amount_cents: Number(line.amount_cents) })).map((line: any) => {
    const detail = events?.find(e => e.entity_id === line.id && e.client_id === inv.client_id)?.detail as { target_id?: string; target_kind?: string } | undefined;
    const recordedFund = line.offering_id ?? inv.offering_id;
    const target = targets.find(t => t.client_id === inv.client_id && (recordedFund ? t.kind === "fund" && t.id === recordedFund : t.id === detail?.target_id && t.kind === detail?.target_kind));
    const journal = journals?.find(j => j.source_id === line.id);
    return { id: line.id, invoiceId: inv.id, clientId: inv.client_id, number: inv.number, label: line.label, amountCents: Number(line.amount_cents), issueDate: inv.issue_date, dueDate: inv.due_date, target: target ?? null, fixedFund: Boolean(recordedFund), accountingStatus: journal?.status ?? (target ? "Awaiting accounting review" : "Needs assignment") };
  }));
  return { targets, rows };
}

export async function linkFeeTarget(context: any, input: { lineId: string; targetId: string; targetKind: "fund" | "company"; reason: string }) {
  const { data: line, error } = await context.supabase.from("invoice_lines").select("id,amount_cents,offering_id,service_key,invoices!inner(id,client_id,status,offering_id)").eq("id", input.lineId).maybeSingle();
  if (error || !line) throw new Error("That invoice fee isn't available.");
  const invoice = Array.isArray(line.invoices) ? line.invoices[0] : line.invoices;
  if (!invoice || !feeEligible(invoice.status, { ...line, amount_cents: Number(line.amount_cents) })) throw new Error("Only issued invoice fees can be assigned for accounting.");
  const view = await readFeeAccounting(context, invoice.id);
  const target = view.targets.find(t => t.id === input.targetId && t.kind === input.targetKind);
  if (!target) throw new Error("That fund or company isn't available.");
  const problem = feeTargetError(invoice.client_id, { ...line, offering_id: line.offering_id ?? invoice.offering_id, amount_cents: Number(line.amount_cents) }, target);
  if (problem) throw new Error(problem);
  const row = view.rows.find((r: any) => r.id === line.id);
  if (row?.target?.id === target.id && row.target.kind === target.kind) return { ok: true };
  if (row && !["Needs assignment", "Awaiting accounting review"].includes(row.accountingStatus)) throw new Error("This fee already has an accounting entry. Correct it through accounting review.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const saved = await supabaseAdmin.from("billing_record_events").insert({ entity_kind: "invoice_line", entity_id: line.id, client_id: invoice.client_id, actor_id: context.userId, event_kind: "accounting_target_linked", detail: { target_id: target.id, target_kind: target.kind, invoice_id: invoice.id, reason: input.reason } });
  if (saved.error) throw new Error("Couldn't save the fee assignment. Please retry.");
  return { ok: true };
}