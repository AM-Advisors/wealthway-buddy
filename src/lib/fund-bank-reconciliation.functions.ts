import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES } from "@/lib/contracts.functions";

/** Admins and the fund's assigned managers may read the fund's bank statement. */
async function assertFundAccess(supabase: any, userId: string, fundId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = ((roles ?? []) as any[]).map((r) => String(r.role));
  if (list.includes("admin") || list.includes("super_admin")) return list;
  const { data: assignment } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", fundId)
    .maybeSingle();
  if (!assignment) throw new Error("Forbidden: you do not manage this fund.");
  return list;
}

function requireAuthority(roles: string[]) {
  const ok = roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r));
  if (!ok) {
    throw new Error(
      "Forbidden: matching a bank deposit to an invoice needs legal, compliance, finance, client success or admin authority.",
    );
  }
}

async function auditEvent(
  supabase: any,
  userId: string,
  entry: {
    action: string;
    target: string;
    clientId: string | null;
    offeringId: string | null;
    previous?: unknown;
    next?: unknown;
  },
) {
  await supabase.from("contract_audit_events").insert({
    area: "invoice",
    action: entry.action,
    target: entry.target,
    client_id: entry.clientId,
    offering_id: entry.offeringId,
    actor_id: userId,
    previous_value: entry.previous ?? null,
    new_value: entry.next ?? null,
    source: "bank statement",
  });
}

/** The fund's bank lines alongside the fee invoices they can settle. */
export const getFundBankStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await assertFundAccess(supabase, userId, data.offeringId);
    const { plaidConfigured } = await import("@/lib/plaid.server");

    const [{ data: account }, { data: lines }, { data: invoices }] = await Promise.all([
      supabase
        .from("bank_accounts")
        .select("id, institution_name, account_name, account_mask, status, last_synced_at")
        .eq("offering_id", data.offeringId)
        .maybeSingle(),
      supabase
        .from("bank_transactions")
        .select(
          "id, posted_on, amount_cents, name, description, matched_application_id, matched_invoice_id, invoice_matched_at",
        )
        .eq("offering_id", data.offeringId)
        .order("posted_on", { ascending: false })
        .limit(100),
      supabase
        .from("invoices")
        .select("id, number, status, total_cents, due_date, paid_on, payment_reference")
        .eq("offering_id", data.offeringId)
        .in("status", ["issued", "paid"])
        .order("issue_date", { ascending: false }),
    ]);

    const invoiceList = ((invoices ?? []) as any[]).map((i) => ({
      id: String(i.id),
      number: (i.number ?? "Draft") as string,
      status: String(i.status),
      totalCents: Number(i.total_cents ?? 0),
      dueDate: (i.due_date ?? null) as string | null,
      paidOn: (i.paid_on ?? null) as string | null,
      reference: (i.payment_reference ?? null) as string | null,
    }));
    const byId = new Map(invoiceList.map((i) => [i.id, i]));
    const openInvoices = invoiceList.filter((i) => i.status === "issued");

    const rows = ((lines ?? []) as any[]).map((t) => {
      const matched = t.matched_invoice_id ? (byId.get(String(t.matched_invoice_id)) ?? null) : null;
      const amount = Number(t.amount_cents ?? 0);
      const suggestion =
        matched || t.matched_application_id
          ? null
          : (openInvoices.find((i) => i.totalCents === amount) ??
            openInvoices.find((i) =>
              i.number
                ? `${t.name ?? ""} ${t.description ?? ""}`.toLowerCase().includes(i.number.toLowerCase())
                : false,
            ) ??
            null);
      return {
        id: String(t.id),
        postedOn: String(t.posted_on),
        amountCents: amount,
        name: (t.name ?? "") as string,
        description: (t.description ?? null) as string | null,
        matchedApplicationId: (t.matched_application_id ?? null) as string | null,
        matchedInvoiceId: matched?.id ?? null,
        matchedInvoiceNumber: matched?.number ?? null,
        matchedAt: (t.invoice_matched_at ?? null) as string | null,
        suggestedInvoiceId: suggestion?.id ?? null,
        suggestedInvoiceNumber: suggestion?.number ?? null,
      };
    });

    return {
      configured: plaidConfigured(),
      connected: Boolean(account),
      account: account ?? null,
      lines: rows,
      openInvoices,
      canMatch: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
      unreconciledCount: rows.filter((r) => !r.matchedInvoiceId && !r.matchedApplicationId).length,
    };
  });

/** Ties one bank deposit to a fee invoice and records the invoice as paid. */
export const matchBankLineToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ transactionId: z.string().uuid(), invoiceId: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: line } = await supabase
      .from("bank_transactions")
      .select("id, offering_id, posted_on, amount_cents, name, matched_invoice_id")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (!line) throw new Error("That bank line is no longer listed.");
    const roles = await assertFundAccess(supabase, userId, String(line.offering_id));
    requireAuthority(roles);
    if (line.matched_invoice_id) throw new Error("That bank line is already matched to an invoice.");

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, number, status, client_id, offering_id, total_cents")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if (String(invoice.offering_id) !== String(line.offering_id)) {
      throw new Error("That invoice does not belong to this fund.");
    }
    if (String(invoice.status) !== "issued") {
      throw new Error("Only an issued invoice can be settled from the bank statement.");
    }

    const now = new Date().toISOString();
    const reference = `Bank statement ${line.posted_on} — ${line.name || "deposit"}`;

    const { error: invoiceError } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_on: line.posted_on, payment_reference: reference })
      .eq("id", data.invoiceId);
    if (invoiceError) throw new Error(invoiceError.message);

    const { error: lineError } = await supabase
      .from("bank_transactions")
      .update({
        matched_invoice_id: data.invoiceId,
        invoice_matched_by: userId,
        invoice_matched_at: now,
      })
      .eq("id", data.transactionId);
    if (lineError) throw new Error(lineError.message);

    await auditEvent(supabase, userId, {
      action: "payment matched to bank statement",
      target: String(invoice.number ?? "invoice"),
      clientId: (invoice.client_id ?? null) as string | null,
      offeringId: String(line.offering_id),
      previous: { status: "issued", paid_on: null },
      next: {
        status: "paid",
        paid_on: line.posted_on,
        reference,
        bank_amount_cents: Number(line.amount_cents ?? 0),
        invoice_total_cents: Number(invoice.total_cents ?? 0),
      },
    });

    const difference = Number(line.amount_cents ?? 0) - Number(invoice.total_cents ?? 0);
    return {
      ok: true,
      message:
        difference === 0
          ? "Matched. The invoice is recorded as paid from the bank statement."
          : "Matched, but the deposit and the invoice total differ — check the amounts.",
    };
  });

/** Undoes a bank match and puts the invoice back to issued. */
export const unmatchBankLineFromInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ transactionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: line } = await supabase
      .from("bank_transactions")
      .select("id, offering_id, matched_invoice_id")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (!line) throw new Error("That bank line is no longer listed.");
    const roles = await assertFundAccess(supabase, userId, String(line.offering_id));
    requireAuthority(roles);
    if (!line.matched_invoice_id) return { ok: true, message: "Nothing to undo." };

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, number, client_id, status")
      .eq("id", line.matched_invoice_id)
      .maybeSingle();

    if (invoice && String(invoice.status) === "paid") {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "issued", paid_on: null, payment_reference: null })
        .eq("id", invoice.id);
      if (error) throw new Error(error.message);
    }

    const { error: lineError } = await supabase
      .from("bank_transactions")
      .update({ matched_invoice_id: null, invoice_matched_by: null, invoice_matched_at: null })
      .eq("id", data.transactionId);
    if (lineError) throw new Error(lineError.message);

    await auditEvent(supabase, userId, {
      action: "bank statement match removed",
      target: String(invoice?.number ?? "invoice"),
      clientId: (invoice?.client_id ?? null) as string | null,
      offeringId: String(line.offering_id),
      previous: { status: "paid" },
      next: { status: "issued" },
    });

    return { ok: true, message: "Match removed and the invoice is awaiting payment again." };
  });
