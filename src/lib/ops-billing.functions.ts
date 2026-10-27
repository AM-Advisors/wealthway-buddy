import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { STAFF_ROLES } from "@/lib/contracts.functions";

/**
 * Read-only billing pipeline for Operations, anchored on signed quotes:
 * signed quote -> statement of work -> billing schedule -> invoices.
 * Actions (approve SOW, review/issue/record payment) stay on their existing screens and server checks.
 */
export const getBillingPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { data: roleRows } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
    const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));
    if (!roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
      throw new Error("Forbidden: this area is for the Harmonious team.");
    }
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: quotes } = await (db as any)
      .from("sales_quotes")
      .select("id, quote_number, version, title, client_id, sow_id, total_cents, signed_at, status")
      .eq("status", "signed")
      .order("signed_at", { ascending: false })
      .limit(500);
    const qs = (quotes ?? []) as any[];
    const sowIds = [...new Set(qs.map((q) => q.sow_id).filter(Boolean))];
    const clientIds = [...new Set(qs.map((q) => q.client_id).filter(Boolean))];
    const none = ["00000000-0000-0000-0000-000000000000"];
    const [clients, sows, schedules, invoices] = await Promise.all([
      (db as any).from("clients").select("id, name").in("id", clientIds.length ? clientIds : none),
      (db as any)
        .from("client_sows")
        .select("id, title, status, approval_status, client_status, client_signed_at, executed_at, effective_date")
        .in("id", sowIds.length ? sowIds : none),
      (db as any)
        .from("invoice_schedules")
        .select("sow_id, label, amount_cents, frequency, next_due_on, active")
        .in("sow_id", sowIds.length ? sowIds : none),
      (db as any)
        .from("invoices")
        .select("id, sow_id, number, status, approval_status, total_cents, issued_on, due_date, paid_at, period_start, period_end, generated_by_schedule")
        .in("sow_id", sowIds.length ? sowIds : none)
        .order("created_at", { ascending: false }),
    ]);
    const clientName = new Map(((clients.data ?? []) as any[]).map((c) => [c.id, c.name]));
    const sowById = new Map(((sows.data ?? []) as any[]).map((s) => [s.id, s]));
    const by = <T extends { sow_id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.sow_id, [...(m.get(r.sow_id) ?? []), r]);
      return m;
    };
    const schedBy = by((schedules.data ?? []) as any[]);
    const invBy = by((invoices.data ?? []) as any[]);
    return {
      quotes: qs.map((q) => ({
        id: q.id,
        number: q.quote_number,
        version: q.version,
        title: q.title,
        clientName: clientName.get(q.client_id) ?? "Client",
        totalCents: Number(q.total_cents ?? 0),
        signedAt: q.signed_at,
        sow: q.sow_id ? sowById.get(q.sow_id) ?? null : null,
        schedules: q.sow_id ? schedBy.get(q.sow_id) ?? [] : [],
        invoices: q.sow_id ? invBy.get(q.sow_id) ?? [] : [],
      })),
    };
  });

/**
 * Read-only ROAS billing consolidation for staff. It gathers the existing
 * quote, invoice and receipt projections without approving, issuing, filing
 * or moving money.
 */
export const getRoasBillingUpdate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { data: roleRows } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
    const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));
    if (!roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
      throw new Error("Forbidden: this area is for the Harmonious team.");
    }

    const quoteId = "d5a7e354-0122-4db2-83b5-73bd9dd91f9a";
    const clientId = "f831e9f7-1850-4646-b991-c1a4bc211bc8";
    const fundId = "acb8193f-35fc-41cc-9ee5-629bde3e11b2";
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [quoteResult, linesResult, invoicesResult, fundResult] = await Promise.all([
      (db as any).from("sales_quotes").select("id, quote_number, version, title, status, total_cents, valid_until, updated_at").eq("id", quoteId).maybeSingle(),
      (db as any).from("sales_quote_lines").select("id, label, quantity, unit_cents, line_cents, billing_frequency, first_bill_on, sort_order").eq("quote_id", quoteId).order("sort_order"),
      (db as any).from("invoices").select("id, client_id, number, status, approval_status, total_cents, issue_date, due_date, paid_on, voided_at, void_reason, period_start, period_end, created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
      (db as any).from("offerings").select("id, name").eq("id", fundId).maybeSingle(),
    ]);
    if (quoteResult.error || linesResult.error || invoicesResult.error || fundResult.error) {
      throw new Error("Couldn't load the ROAS billing update. Please try again.");
    }
    if (!quoteResult.data) throw new Error("The ROAS draft quote could not be found.");

    const { withInvoiceBalances } = await import("@/lib/invoice-balance.server");
    const invoices = await withInvoiceBalances((invoicesResult.data ?? []) as any[]);
    return {
      clientName: "Roas Capital Management",
      fundName: fundResult.data?.name ?? "ROAS Hedge LP",
      quote: {
        id: quoteResult.data.id,
        number: `Q-${quoteResult.data.quote_number} v${quoteResult.data.version}`,
        title: quoteResult.data.title,
        status: quoteResult.data.status,
        totalCents: Number(quoteResult.data.total_cents ?? 0),
        validUntil: quoteResult.data.valid_until ?? null,
        updatedAt: quoteResult.data.updated_at ?? null,
      },
      lines: ((linesResult.data ?? []) as any[]).map((line) => ({
        id: line.id,
        label: line.label,
        quantity: Number(line.quantity ?? 0),
        unitCents: Number(line.unit_cents ?? 0),
        lineCents: Number(line.line_cents ?? 0),
        billingFrequency: line.billing_frequency ?? "one_time",
        firstBillOn: line.first_bill_on ?? null,
      })),
      invoices: invoices.map((invoice: any) => ({
        id: invoice.id,
        number: invoice.number ?? null,
        status: invoice.status,
        approvalStatus: invoice.approval_status ?? null,
        totalCents: Number(invoice.total_cents ?? 0),
        paidCents: Number(invoice.recorded_paid_cents ?? 0),
        remainingCents: Number(invoice.remaining_cents ?? 0),
        partiallyPaid: Boolean(invoice.partially_paid),
        issueDate: invoice.issue_date ?? null,
        dueDate: invoice.due_date ?? null,
        paidOn: invoice.paid_on ?? invoice.recorded_paid_on ?? null,
        voidedAt: invoice.voided_at ?? null,
        voidReason: invoice.void_reason ?? null,
        periodStart: invoice.period_start ?? null,
        periodEnd: invoice.period_end ?? null,
      })),
    };
  });

/** Read-only exact-client payment projection. No receipt notes or bank references leave the server. */
export async function getRoasPaymentsHandler({ context }: { context: any }) {
  if (!context.userId) throw new Error("Sign in to view payments.");
  const { data: roleRows, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (roleError || !(roleRows ?? []).some((row: { role: string }) => (STAFF_ROLES as readonly string[]).includes(row.role))) {
    throw new Error("Forbidden: this area is for the Harmonious team.");
  }
  const clientId = "f831e9f7-1850-4646-b991-c1a4bc211bc8";
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await db.from("invoices")
    .select("id, client_id, number, status, total_cents, paid_on, due_date, period_start, period_end")
    .eq("client_id", clientId).order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load ROAS payments. Please try again.");
  const { withInvoiceBalances } = await import("@/lib/invoice-balance.server");
  const invoices = await withInvoiceBalances(rows ?? []);
  const ids = invoices.map(invoice => invoice.id);
  const lineResult = ids.length ? await db.from("invoice_lines")
    .select("id, invoice_id, label, service_key, amount_cents").in("invoice_id", ids).order("sort_order") : { data: [], error: null };
  if (lineResult.error) throw new Error("Couldn't load invoice services. Please try again.");
  return {
    invoices: invoices.map(invoice => ({
      id: invoice.id, number: invoice.number, status: invoice.status,
      totalCents: Number(invoice.total_cents), paidCents: invoice.recorded_paid_cents,
      remainingCents: invoice.remaining_cents, paidOn: invoice.status === "paid" ? invoice.paid_on ?? invoice.recorded_paid_on : invoice.recorded_paid_on,
      dueDate: invoice.due_date, periodStart: invoice.period_start, periodEnd: invoice.period_end,
    })),
    lines: (lineResult.data ?? []).map(line => ({ id: line.id, invoiceId: line.invoice_id, label: line.label, serviceKey: line.service_key, amountCents: Number(line.amount_cents) })),
  };
}

export const getRoasPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(getRoasPaymentsHandler);
