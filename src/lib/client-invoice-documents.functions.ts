import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { invoiceSourceMatches, invoiceSowMatches } from "./client-billing-links";

/** RLS-entitled invoice is the boundary; only its same-client original document is projected. */
export const getInvoiceOriginalQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ invoiceId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: inv, error } = await context.supabase.from("invoices").select("id, client_id, number, status, total_cents, due_date, sales_quote_id, sales_document_id, acceptance_key, sow_id").eq("id", data.invoiceId).neq("status", "draft").maybeSingle();
    if (error || !inv) throw new Error("Invoice not found or access unavailable.");
    if (!inv.sales_quote_id) throw new Error("No original quote is recorded for this invoice.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: quote, error: quoteError } = await db.from("sales_quotes").select("id, client_id, version, status, title, valid_until, sections").eq("id", inv.sales_quote_id).maybeSingle();
    if (quoteError || !quote || !invoiceSourceMatches(inv, quote)) throw new Error("The exact original quote is unavailable. Please contact your Harmonious representative.");
    let sections: { title: string; body: string }[] = [];
    let title = quote.title, version = quote.version;
    if (inv.sales_document_id) {
      const { data: doc } = await db.from("sales_documents").select("id, client_id, quote_id, title").eq("id", inv.sales_document_id).maybeSingle();
      const expectedVersion = Number(inv.acceptance_key?.split(":").at(-1));
      if (!doc || doc.client_id !== inv.client_id || doc.quote_id !== quote.id || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("The original proposal version is unavailable.");
      const { data: original, error: originalError } = await db.from("sales_document_versions").select("sections").eq("document_id", doc.id).eq("version", expectedVersion).maybeSingle();
      if (originalError || !original) throw new Error("The original proposal version is unavailable.");
      const { isSectionShown } = await import("./sales-documents-model");
      const allowed = new Set(["summary", "needs", "approach", "services", "pricing", "terms", "about", "timeline", "next_steps"]);
      sections = (Array.isArray(original.sections) ? original.sections : []).filter((s: any) => allowed.has(s.key) && isSectionShown(s)).map((s: any) => ({ title: String(s.title ?? ""), body: String(s.body ?? "") }));
      title = doc.title; version = expectedVersion;
    }
    const { data: lines, error: linesError } = await db.from("invoice_lines").select("label, quantity, unit_cents, amount_cents").eq("invoice_id", inv.id).order("sort_order");
    if (linesError) throw new Error("The recorded invoice pricing could not be loaded.");
    if (!inv.sales_document_id) {
      const { data: client } = await db.from("clients").select("name, legal_name").eq("id", inv.client_id).maybeSingle();
      const { data: quoteLines, error: quoteLinesError } = await db.from("sales_quote_lines").select("label, quantity, unit_cents, billing_frequency, service_details").eq("quote_id", quote.id).order("sort_order");
      if (quoteLinesError) throw new Error("The original quote terms could not be loaded.");
      const { quoteClientSections, quoteLockFacts, sanitizeQuoteSections } = await import("./quote-sections-model");
      const facts = quoteLockFacts({ organization: client?.legal_name ?? client?.name ?? null, contactName: null,
        lines: (quoteLines ?? []).map((l: any) => ({ label: l.label, quantity: Number(l.quantity), unitCents: Number(l.unit_cents), billingFrequency: l.billing_frequency, details: l.service_details })) });
      // The quote's client-visible sections only; no CRM notes, approvals or staff messages.
      sections = quoteClientSections(sanitizeQuoteSections(quote.sections).filter(s => !["notes", "about"].includes(s.key)), facts, null, null);
    }
    // Recorded invoice lines are the frozen billed terms, never today's rate card.
    const [invoice] = await (await import("./invoice-balance.server")).withInvoiceBalances([inv]);
    const { data: sow } = inv.sow_id ? await context.supabase.from("client_sows").select("id, client_id, status").eq("id", inv.sow_id).maybeSingle() : { data: null };
    return { invoice, sowId: sow && invoiceSowMatches(inv, sow) ? sow.id : null, title: String(title), version: Number(version), validUntil: quote.valid_until as string | null, sections, lines: (lines ?? []) as { label: string; quantity: number; unit_cents: number; amount_cents: number }[] };
  });