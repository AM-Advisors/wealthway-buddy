import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";
import { assertNoHold } from "@/lib/compliance-holds.functions";

export const INVOICE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
] as const;

type Who = { userId: string; roles: string[]; isStaff: boolean; canManage: boolean };

async function whoIs(context: any): Promise<Who> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId,
    roles,
    isStaff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)),
    canManage: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
  };
}

async function requireStaff(context: any) {
  const who = await whoIs(context);
  if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");
  return who;
}

async function requireContractAuthority(context: any) {
  const who = await whoIs(context);
  if (!who.canManage) {
    throw new Error(
      "Forbidden: preparing or issuing invoices needs legal, compliance, finance, client success or admin authority.",
    );
  }
  return who;
}

async function audit(
  context: any,
  who: Who,
  entry: {
    action: string;
    target?: string | null;
    clientId?: string | null;
    offeringId?: string | null;
    previous?: unknown;
    next?: unknown;
  },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: who.userId,
    actor_role: who.roles.join(", ") || null,
    client_id: entry.clientId ?? null,
    offering_id: entry.offeringId ?? null,
    area: "invoice",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

/** The fund an invoice's lines belong to, so fund-level trails show the
 *  issuing and payment steps alongside the fees themselves. */
async function invoiceOfferingId(context: any, invoiceId: string) {
  const { data } = await context.supabase
    .from("invoice_lines")
    .select("offering_id")
    .eq("invoice_id", invoiceId)
    .not("offering_id", "is", null)
    .limit(1)
    .maybeSingle();
  return (data as any)?.offering_id ?? null;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function recalcTotal(context: any, invoiceId: string) {
  const { data: lines } = await context.supabase
    .from("invoice_lines")
    .select("amount_cents")
    .eq("invoice_id", invoiceId);
  const total = (lines ?? []).reduce((sum: number, l: any) => sum + Number(l.amount_cents ?? 0), 0);
  await context.supabase.from("invoices").update({ total_cents: total }).eq("id", invoiceId);
  return total;
}

/** Every invoice with its lines, plus the reference data the billing screen needs. */
export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const [{ data: invoices, error }, { data: clients }, { data: sows }, { data: funds }] =
      await Promise.all([
        context.supabase
          .from("invoices")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300),
        context.supabase.from("clients").select("id, name").order("name"),
        context.supabase.from("client_sows").select("id, client_id, title, status, notice_days"),
        context.supabase.from("offerings").select("id, name, client_id").order("name"),
      ]);
    if (error) throw new Error(error.message);

    const ids = (invoices ?? []).map((i: any) => i.id);
    let lines: any[] = [];
    if (ids.length) {
      const { data } = await context.supabase
        .from("invoice_lines")
        .select("*")
        .in("invoice_id", ids)
        .order("sort_order");
      lines = data ?? [];
    }
    const clientById = new Map((clients ?? []).map((c: any) => [c.id, c]));
    const today = new Date().toISOString().slice(0, 10);

    return {
      canManage: who.canManage,
      clients: clients ?? [],
      sows: sows ?? [],
      funds: funds ?? [],
      invoices: await (await import("@/lib/invoice-balance.server")).withInvoiceBalances((invoices ?? []).map((inv: any) => ({
        ...inv,
        clientName: clientById.get(inv.client_id)?.name ?? "Unknown client",
        overdue: inv.status === "issued" && !!inv.due_date && inv.due_date < today,
        lines: lines.filter((l) => l.invoice_id === inv.id),
      }))),
    };
  });

/** What would be billed for a client over a period: contracted rates on active
 *  services, plus third-party costs not yet billed. */
export const previewInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        offeringId: z.string().uuid().nullable().optional(),
        sowId: z.string().uuid().nullable().optional(),
        periodStart: z.string().min(4).max(20),
        periodEnd: z.string().min(4).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    return await collectLines(context, data);
  });

async function collectLines(
  context: any,
  data: { clientId: string; periodStart: string; periodEnd: string; offeringId?: string | null | undefined; sowId?: string | null | undefined },
) {
  const { collectInvoiceRates } = await import("@/lib/invoice-pricing.server");
  const rates = await collectInvoiceRates(context.supabase, data);
  const { data: expenses, error } = await context.supabase.from("pass_through_expenses").select("*")
    .eq("client_id", data.clientId).eq("billing_status", "unbilled")
    .gte("incurred_on", data.periodStart).lte("incurred_on", data.periodEnd);
  if (error) throw new Error("Invoice expenses couldn't be loaded. Please retry.");
  const expenseLines = ((expenses ?? []) as any[])
    .filter(e => !data.offeringId || e.offering_id === data.offeringId)
    .map((e, index) => ({ source: "expense", service_key: null, label: e.description,
      description: `Third-party cost incurred ${e.incurred_on}`, quantity: 1,
      unit_cents: Number(e.amount_cents ?? 0), amount_cents: Number(e.amount_cents ?? 0),
      pricing_id: null, expense_id: e.id, offering_id: e.offering_id ?? null,
      sort_order: rates.lines.length + index }));
  const lines = [...rates.lines, ...expenseLines];
  return { ...rates, lines, totalCents: lines.reduce((sum, l) => sum + l.amount_cents, 0) };
}

/** Create a draft invoice from the client's contracted fees and active services. */
export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        sowId: z.string().uuid().nullable().optional(),
        offeringId: z.string().uuid().nullable().optional(),
        periodStart: z.string().min(4).max(20),
        periodEnd: z.string().min(4).max(20),
        netDays: z.number().int().min(0).max(180).default(30),
        note: z.string().max(1000).optional().or(z.literal("")),
        alreadyPaidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        alreadyPaidReference: z.string().max(120).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    if (data.alreadyPaidOn && data.alreadyPaidOn > new Date().toISOString().slice(0, 10)) throw new Error("A past payment date can't be in the future.");
    if (data.offeringId) {
      const { data: o } = await context.supabase.from("offerings").select("client_id").eq("id", data.offeringId).maybeSingle();
      if (!o || (o as any).client_id !== data.clientId) throw new Error("That fund doesn't belong to the chosen client.");
    }
    const built = await collectLines(context, data);
    if (!built.lines.length) {
      throw new Error(
        "Nothing to bill for that period: no contracted rates on active services and no unbilled third-party costs.",
      );
    }

    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .insert({
        client_id: data.clientId,
        sow_id: data.sowId ?? built.activeSow?.id ?? null,
        offering_id: data.offeringId ?? null,
        paid_before_issue_on: data.alreadyPaidOn ?? null,
        paid_before_issue_reference: data.alreadyPaidOn ? data.alreadyPaidReference || null : null,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        net_days: data.netDays,
        note: data.note || null,
        status: "draft",
        total_cents: built.totalCents,
        created_by: who.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { error: lineError } = await context.supabase
      .from("invoice_lines")
      .insert(built.lines.map((l) => ({ ...l, invoice_id: (invoice as any).id })));
    if (lineError) throw new Error(lineError.message);

    await audit(context, who, {
      action: "draft prepared",
      target: `${data.periodStart} to ${data.periodEnd}`,
      clientId: data.clientId,
      next: { total_cents: built.totalCents, lines: built.lines.length },
    });
    return { ok: true, id: (invoice as any).id };
  });

/** Add or change one line on a draft invoice. */
export const saveInvoiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        invoiceId: z.string().uuid(),
        label: z.string().trim().min(2).max(200),
        description: z.string().max(500).optional().or(z.literal("")),
        quantity: z.number().int().min(1).max(10000).default(1),
        unitCents: z.number().int().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if ((invoice as any).status !== "draft") {
      throw new Error("Only a draft invoice can be changed. Void it and prepare a new one.");
    }

    const row = {
      invoice_id: data.invoiceId,
      source: "manual",
      label: data.label,
      description: data.description || null,
      quantity: data.quantity,
      unit_cents: data.unitCents,
      amount_cents: data.unitCents * data.quantity,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("invoice_lines")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("invoice_lines").insert(row);
      if (error) throw new Error(error.message);
    }
    const total = await recalcTotal(context, data.invoiceId);
    await audit(context, who, {
      action: data.id ? "line changed" : "line added",
      target: data.label,
      clientId: (invoice as any).client_id,
      next: { total_cents: total },
    });
    return { ok: true };
  });

export const deleteInvoiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: line } = await context.supabase
      .from("invoice_lines")
      .select("*, invoices(status, client_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!line) throw new Error("That line isn't available.");
    if ((line as any).invoices?.status !== "draft") {
      throw new Error("Only a draft invoice can be changed.");
    }
    const { error } = await context.supabase.from("invoice_lines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const total = await recalcTotal(context, (line as any).invoice_id);
    await audit(context, who, {
      action: "line removed",
      target: (line as any).label,
      clientId: (line as any).invoices?.client_id ?? null,
      previous: { amount_cents: (line as any).amount_cents },
      next: { total_cents: total },
    });
    return { ok: true };
  });

/** Compare every billed line with the client's contracted rate card. */
async function checkRates(context: any, invoiceId: string, clientId: string) {
  const { checkInvoiceRates } = await import("@/lib/invoice-pricing.server");
  return checkInvoiceRates(context.supabase, invoiceId, clientId);
}

/** Everything that must be true before money is asked for or moved. */
export const reviewInvoiceRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("id, client_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    return await checkRates(context, data.id, (invoice as any).client_id);
  });

/** Marks a draft reviewed. The reviewer can't also issue it. */
export const markInvoiceReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: invoice } = await context.supabase.from("invoices").select("id, status, client_id, created_by, reviewed_by").eq("id", data.id).maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if ((invoice as any).status !== "draft") throw new Error("Only a draft can be reviewed.");
    if ((invoice as any).reviewed_by) throw new Error("This draft has already been reviewed.");
    const { error } = await context.supabase.from("invoices").update({ reviewed_by: who.userId, reviewed_at: new Date().toISOString() }).eq("id", data.id).eq("status", "draft");
    if (error) throw new Error(error.message);
    await audit(context, who, { action: "draft reviewed", target: "draft", clientId: (invoice as any).client_id, next: { reviewed_by: who.userId } });
    return { ok: true };
  });

/** Starts card checkout for an issued invoice. Only the client's own people can pay; the webhook marks it paid. */
export const startInvoiceCardPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), environment: z.enum(["sandbox", "live"]), returnUrl: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: links } = await context.supabase.from("client_users").select("client_id").eq("user_id", context.userId);
    const mine = new Set(((links ?? []) as any[]).map((l) => l.client_id));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: inv } = await db.from("invoices").select("id, client_id, number, status, total_cents").eq("id", data.id).maybeSingle();
    if (!inv || !mine.has(inv.client_id)) return { error: "That invoice isn't available." };
    if (inv.status !== "issued") return { error: inv.status === "paid" ? "This invoice is already paid." : "Only an issued invoice can be paid." };
    if (!(Number(inv.total_cents) > 0)) return { error: "Nothing to pay." };
    const [balance] = await (await import("@/lib/invoice-balance.server")).withInvoiceBalances([inv]);
    if (balance?.partially_paid) return { error: "This invoice has a recorded partial payment. Please contact billing to settle the remaining balance without paying the original amount again." };
    const origin = new URL(data.returnUrl).origin;
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient(data.environment);
      const { data: { user } } = await context.supabase.auth.getUser();
      const { customerForClient } = await import("@/lib/billing.server");
      const customer = await customerForClient(stripe, inv.client_id, user?.email, context.userId);
      const { cardServiceFeeCents, CARD_SERVICE_FEE_LABEL } = await import("@/lib/card-fee");
      const feeCents = cardServiceFeeCents(Number(inv.total_cents));
      const meta = { kind: "invoice_payment", invoiceId: inv.id, clientId: inv.client_id, userId: context.userId, invoiceCents: String(inv.total_cents), cardFeeCents: String(feeCents) };
      const session = await stripe.checkout.sessions.create({
        mode: "payment", ui_mode: "embedded_page", redirect_on_completion: "if_required", return_url: `${origin}/client/invoices?invoice=${inv.id}`,
        customer, metadata: meta, payment_intent_data: { description: `Invoice ${inv.number}`, metadata: meta },
        line_items: [{ price_data: { currency: "usd", unit_amount: Number(inv.total_cents), product_data: { name: `Invoice ${inv.number}` } }, quantity: 1 },
          ...(feeCents > 0 ? [{ price_data: { currency: "usd", unit_amount: feeCents, product_data: { name: CARD_SERVICE_FEE_LABEL } }, quantity: 1 }] : [])],
      } as any);
      await db.from("invoices").update({ card_session_id: session.id }).eq("id", inv.id).eq("status", "issued");
      return { clientSecret: session.client_secret ?? "" };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

/** Issue a draft: stamp the number, the issue date and the payment due date. */
export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        issueDate: z.string().min(4).max(20),
        netDays: z.number().int().min(0).max(180).default(30),
        overrideReason: z.string().max(500).optional().or(z.literal("")),
        selfIssueReason: z.string().max(500).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if ((invoice as any).status !== "draft") throw new Error("This invoice has already been issued.");
    const { issueBlocker } = await import("@/lib/invoice-schedule-model");
    const blocked = issueBlocker({
      issuerId: who.userId, createdBy: (invoice as any).created_by ?? null, reviewedBy: (invoice as any).reviewed_by ?? null,
      generatedBySchedule: Boolean((invoice as any).generated_by_schedule), isSuperAdmin: who.roles.includes("super_admin"), selfReason: data.selfIssueReason,
    });
    if (blocked) throw new Error(blocked);
    const selfIssued = who.userId === (invoice as any).created_by || who.userId === (invoice as any).reviewed_by;

    const total = await recalcTotal(context, data.id);
    if (total <= 0) throw new Error("An invoice needs at least one payable line before it is issued.");

    const rates = await checkRates(context, data.id, (invoice as any).client_id);
    if (rates.varianceCents > 0 && !data.overrideReason) {
      throw new Error(
        "This invoice bills above the client's contracted rate. Record the written authorization for the difference before issuing it.",
      );
    }


    const year = data.issueDate.slice(0, 4);
    const { count } = await context.supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .not("number", "is", null)
      .like("number", `HRM-${year}-%`);
    const number = `HRM-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;

    const dueDate = addDays(data.issueDate, data.netDays);
    const { error } = await context.supabase
      .from("invoices")
      .update({
        status: "issued",
        number,
        issue_date: data.issueDate,
        due_date: dueDate,
        net_days: data.netDays,
        issued_by: who.userId,
        issued_at: new Date().toISOString(),
        approval_status: "pending",
        approval_requested_at: new Date().toISOString(),
        rate_variance_cents: rates.varianceCents,
        rate_override_reason: data.overrideReason || null,
        rate_check: rates.items as any,
        issue_self_reason: selfIssued ? data.selfIssueReason || null : null,
      })
      .eq("id", data.id)
      .eq("status", "draft");
    if (error) throw new Error(error.message);


    const { data: lines } = await context.supabase
      .from("invoice_lines")
      .select("expense_id")
      .eq("invoice_id", data.id)
      .not("expense_id", "is", null);
    const expenseIds = (lines ?? []).map((l: any) => l.expense_id).filter(Boolean);
    if (expenseIds.length) {
      await context.supabase
        .from("pass_through_expenses")
        .update({ billing_status: "billed" })
        .in("id", expenseIds);
    }

    await audit(context, who, {
      action: "issued",
      target: number,
      clientId: (invoice as any).client_id,
      offeringId: await invoiceOfferingId(context, data.id),
      previous: { status: "draft", number: (invoice as any).number ?? null, due_date: null },
      next: { status: "issued", number, total_cents: total, due_date: dueDate, ...(selfIssued ? { self_issue_reason: data.selfIssueReason } : {}) },
    });

    // Marked at creation as already paid outside the platform: record the payment (record only, nothing is collected) and skip the "please pay" email.
    const priorPaid = (invoice as any).paid_before_issue_on as string | null;
    if (priorPaid) {
      const reference = (invoice as any).paid_before_issue_reference ?? null;
      const { error: payErr } = await context.supabase.from("invoices").update({ status: "paid", paid_on: priorPaid, payment_reference: reference }).eq("id", data.id).eq("status", "issued");
      if (payErr) throw new Error(payErr.message);
      await audit(context, who, {
        action: "payment recorded", target: number, clientId: (invoice as any).client_id,
        offeringId: await invoiceOfferingId(context, data.id),
        previous: { status: "issued", paid_on: null, reference: null },
        next: { status: "paid", paid_on: priorPaid, reference, recorded_as: "paid before issue" },
      });
      await (await import("@/lib/billing-schedule.server")).onInvoicePaid(data.id);
      return { ok: true, number, dueDate, paid: true };
    }

    const { notifyClientAdminsWith, money, CLIENT_PORTAL_BASE } = await import(
      "@/lib/client-notify.server"
    );
    const { data: billed } = await context.supabase
      .from("invoice_lines")
      .select("label, amount_cents, sort_order")
      .eq("invoice_id", data.id)
      .order("sort_order", { ascending: true });
    const { data: clientRow } = await context.supabase
      .from("clients")
      .select("legal_name, name")
      .eq("id", (invoice as any).client_id)
      .maybeSingle();

    await notifyClientAdminsWith(
      (invoice as any).client_id,
      "invoice-issued",
      `invoice-issued:${data.id}`,
      (person) => ({
        contactName: person.name,
        clientName:
          (clientRow as any)?.legal_name || (clientRow as any)?.name || "your organization",
        invoiceNumber: number,
        amount: money(total),
        issueDate: data.issueDate,
        dueDate,
        periodLabel: `${(invoice as any).period_start} to ${(invoice as any).period_end}`,
        lines: (billed ?? []).map((l: any) => ({
          label: String(l.label ?? "Service fee"),
          amount: money(Number(l.amount_cents ?? 0)),
        })),
        payUrl: `${CLIENT_PORTAL_BASE}/client/invoices?invoice=${data.id}`,
        note: (invoice as any).note || "",
      }),
    );


    return { ok: true, number, dueDate };
  });

/** Who the invoice email reached, and whether anything went wrong. Staff only. */
export const getInvoiceDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("id, client_id, status, issued_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if ((invoice as any).status === "draft") {
      return { rows: [], confirmed: false, problem: false, available: true, draft: true };
    }
    const { invoiceDelivery } = await import("@/lib/invoice-delivery.server");
    const result = await invoiceDelivery(
      String((invoice as any).client_id),
      (invoice as any).issued_at ?? null,
    );
    return { ...result, draft: false };
  });

/** Send the invoice email again to the client's decision makers. */
export const resendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if ((invoice as any).status === "draft") {
      throw new Error("Issue this invoice before sending it to the client.");
    }
    if ((invoice as any).status === "void") {
      throw new Error("This invoice was voided, so it can't be sent again.");
    }

    const { notifyClientAdminsWith, money, CLIENT_PORTAL_BASE } = await import(
      "@/lib/client-notify.server"
    );
    const { data: billed } = await context.supabase
      .from("invoice_lines")
      .select("label, amount_cents, sort_order")
      .eq("invoice_id", data.id)
      .order("sort_order", { ascending: true });
    const { data: clientRow } = await context.supabase
      .from("clients")
      .select("legal_name, name")
      .eq("id", (invoice as any).client_id)
      .maybeSingle();

    const stamp = new Date().toISOString();
    await notifyClientAdminsWith(
      (invoice as any).client_id,
      "invoice-issued",
      `invoice-resend:${data.id}:${stamp}`,
      (person) => ({
        contactName: person.name,
        clientName:
          (clientRow as any)?.legal_name || (clientRow as any)?.name || "your organization",
        invoiceNumber: String((invoice as any).number ?? ""),
        amount: money(Number((invoice as any).total_cents ?? 0)),
        issueDate: String((invoice as any).issue_date ?? ""),
        dueDate: String((invoice as any).due_date ?? ""),
        periodLabel: `${(invoice as any).period_start} to ${(invoice as any).period_end}`,
        lines: (billed ?? []).map((l: any) => ({
          label: String(l.label ?? "Service fee"),
          amount: money(Number(l.amount_cents ?? 0)),
        })),
        payUrl: `${CLIENT_PORTAL_BASE}/client/invoices?invoice=${data.id}`,
        note: (invoice as any).note || "",
      }),
    );

    await audit(context, who, {
      action: "email_resent",
      target: String((invoice as any).number ?? data.id),
      clientId: (invoice as any).client_id,
      offeringId: await invoiceOfferingId(context, data.id),
      next: { resent_at: stamp },
    });

    return { ok: true };
  });

export const recordInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        paidOn: z.string().min(4).max(20),
        reference: z.string().max(120).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if ((invoice as any).status !== "issued") throw new Error("Only an issued invoice can be paid.");
    if (data.paidOn > new Date().toISOString().slice(0, 10)) throw new Error("The payment date can't be in the future.");
    const { error } = await context.supabase
      .from("invoices")
      .update({ status: "paid", paid_on: data.paidOn, payment_reference: data.reference || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: "payment recorded",
      target: (invoice as any).number,
      clientId: (invoice as any).client_id,
      offeringId: await invoiceOfferingId(context, data.id),
      previous: { status: "issued", paid_on: null, reference: null },
      next: { status: "paid", paid_on: data.paidOn, reference: data.reference || null },
    });
    await (await import("@/lib/billing-schedule.server")).onInvoicePaid(data.id);
    return { ok: true };
  });

export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if ((invoice as any).status === "paid") throw new Error("A paid invoice can't be voided.");
    const { error } = await context.supabase
      .from("invoices")
      .update({ status: "void", voided_at: new Date().toISOString(), void_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: "voided",
      target: (invoice as any).number ?? "draft",
      clientId: (invoice as any).client_id,
      previous: { status: (invoice as any).status },
      next: { status: "void", reason: data.reason },
    });
    await (await import("@/lib/commissions.server")).cancelInvoicePayouts(data.id, `Invoice voided: ${data.reason}`, who.userId);
    return { ok: true };
  });

/** Ask the client to approve an issued invoice (or re-ask after a dispute). */
export const requestInvoiceApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    if ((invoice as any).status !== "issued") {
      throw new Error("Issue the invoice before asking the client to approve it.");
    }
    const { error } = await context.supabase
      .from("invoices")
      .update({
        approval_status: "pending",
        approval_requested_at: new Date().toISOString(),
        dispute_reason: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: "approval requested",
      target: (invoice as any).number,
      clientId: (invoice as any).client_id,
    });
    return { ok: true };
  });

/** Invoices a client contact can see, with the one waiting on them first. */
export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: invoices, error } = await context.supabase
      .from("invoices")
      .select("*")
      .neq("status", "draft")
      .order("issue_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = (invoices ?? []).map((i: any) => i.id);
    let lines: any[] = [];
    if (ids.length) {
      const { data } = await context.supabase
        .from("invoice_lines")
        .select("*")
        .in("invoice_id", ids)
        .order("sort_order");
      lines = data ?? [];
    }
    const today = new Date().toISOString().slice(0, 10);
    const clientIds = Array.from(
      new Set((invoices ?? []).map((i: any) => i.client_id).filter(Boolean)),
    );
    let clients: any[] = [];
    if (clientIds.length) {
      const { data } = await context.supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      clients = data ?? [];
    }
    const sowIds = [...new Set((invoices ?? []).map(inv => inv.sow_id).filter((id): id is string => !!id))];
    const { data: entitledSows, error: sowError } = sowIds.length ? await context.supabase.from("client_sows").select("id, client_id, status").in("id", sowIds) : { data: [], error: null };
    if (sowError) throw new Error("Related agreements could not be loaded. Please try again.");
    const { invoiceSowMatches } = await import("./client-billing-links");
    return {
      invoices: await (await import("@/lib/invoice-balance.server")).withInvoiceBalances((invoices ?? []).map((inv: any) => ({
        ...inv,
        overdue: inv.status === "issued" && !!inv.due_date && inv.due_date < today,
        client_name: clients.find((c) => c.id === inv.client_id)?.name ?? null,
        linked_sow_id: entitledSows?.find(s => invoiceSowMatches(inv, s))?.id ?? null,
        lines: lines.filter((l) => l.invoice_id === inv.id),
      }))),
    };
  });

/** A client contact approves or disputes their own invoice. */
export const respondToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "disputed"]),
        signerName: z.string().max(160).optional().or(z.literal("")),
        reason: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const args: Record<string, string> = {
      _invoice_id: data.id,
      _decision: data.decision,
    };
    if (data.signerName) args["_signer_name"] = data.signerName;
    if (data.reason) args["_reason"] = data.reason;
    const { error } = await context.supabase.rpc("respond_to_invoice", args as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Turn an approved invoice into a wire instruction for dual approval. */
export const raiseInvoiceWire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        method: z.enum(["wire", "ach"]).default("wire"),
        originatingAccount: z.string().max(160).optional().or(z.literal("")),
        beneficiaryName: z.string().max(160).optional().or(z.literal("")),
        beneficiaryAccount: z.string().max(160).optional().or(z.literal("")),
        note: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    const inv = invoice as any;
    if (inv.status !== "issued") throw new Error("Only an issued invoice can be collected.");
    if (inv.approval_status !== "approved") {
      throw new Error("The client has to approve this invoice before a payment is raised.");
    }
    if (inv.payment_instruction_id) {
      throw new Error("A payment has already been raised for this invoice.");
    }
    await assertNoHold(context.supabase, "wires", {
      clientId: inv.client_id,
      offeringId: inv.offering_id ?? null,
    });

    const rates = await checkRates(context, data.id, inv.client_id);
    if (rates.varianceCents > 0 && !inv.rate_override_reason) {
      throw new Error(
        "This invoice is above the contracted rate and has no recorded authorization. Fix the rate before collecting payment.",
      );
    }

    const { data: created, error } = await context.supabase
      .from("payment_instructions")
      .insert({
        client_id: inv.client_id,
        offering_id: inv.offering_id ?? null,
        invoice_id: inv.id,
        direction: "inbound",
        purpose: "fee",
        amount_cents: Number(inv.total_cents ?? 0),
        originating_account: data.originatingAccount || null,
        beneficiary_name: data.beneficiaryName || null,
        beneficiary_account: data.beneficiaryAccount || null,
        authorization_reference: `Invoice ${inv.number} approved by ${inv.client_signer_name} on ${String(inv.client_approved_at ?? "").slice(0, 10)}`,
        callback_status: "not_required",
        requested_by: who.userId,
        status: "awaiting_approval",
        note: `${data.method === "ach" ? "ACH" : "Wire"} collection. ${data.note ?? ""}`.trim(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase
      .from("invoices")
      .update({ payment_instruction_id: (created as any).id })
      .eq("id", data.id);

    await audit(context, who, {
      action: "payment raised",
      target: inv.number,
      clientId: inv.client_id,
      next: { amount_cents: inv.total_cents, method: data.method },
    });
    return { ok: true, instructionId: (created as any).id as string };
  });

/** A client contact records that they have sent payment for an approved invoice.
 *  This is their confirmation of the transfer - Harmonious still checks the money
 *  has arrived before the invoice is marked paid. Guarded in the database. */
export const declareInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        method: z.enum(["wire", "ach"]),
        paidOn: z.string().min(10).max(10),
        reference: z.string().max(160).optional().or(z.literal("")),
        note: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("client_declare_invoice_payment", {
      _invoice_id: data.id,
      _method: data.method,
      _paid_on: data.paidOn,
      _reference: data.reference || null,
      _note: data.note || null,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
