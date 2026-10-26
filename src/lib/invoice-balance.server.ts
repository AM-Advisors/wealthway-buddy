import { invoiceBalance } from "./invoice-balance";

/** Call only with invoices already returned by the caller's authorized reader.
 * Private audit payloads never leave the server, only numeric receipt totals. */
export async function withInvoiceBalances<T extends { id: string; client_id: string; total_cents: unknown; status: string }>(invoices: T[]) {
  if (!invoices.length) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("billing_record_events")
    .select("entity_id, client_id, detail, created_at")
    .eq("entity_kind", "invoice").eq("event_kind", "receipt_total_recorded")
    .in("entity_id", invoices.map(inv => inv.id)).order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load recorded invoice payments. Please try again.");
  return invoices.map(inv => {
    const event = data?.find(e => e.entity_id === inv.id && e.client_id === inv.client_id);
    const detail = event?.detail as { paid_cents?: number } | undefined;
    const balance = invoiceBalance({ ...inv, recorded_paid_cents: detail?.paid_cents });
    return { ...inv, recorded_paid_cents: balance.paidCents, remaining_cents: balance.remainingCents, partially_paid: balance.partiallyPaid };
  });
}