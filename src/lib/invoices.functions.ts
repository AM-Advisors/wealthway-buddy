import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
      invoices: (invoices ?? []).map((inv: any) => ({
        ...inv,
        clientName: clientById.get(inv.client_id)?.name ?? "Unknown client",
        overdue: inv.status === "issued" && !!inv.due_date && inv.due_date < today,
        lines: lines.filter((l) => l.invoice_id === inv.id),
      })),
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
  data: { clientId: string; periodStart: string; periodEnd: string },
) {
  const [{ data: pricing }, { data: entitlements }, { data: expenses }, { data: sows }] =
    await Promise.all([
      context.supabase.from("client_pricing").select("*").eq("client_id", data.clientId),
      context.supabase.from("service_entitlements").select("*").eq("client_id", data.clientId),
      context.supabase
        .from("pass_through_expenses")
        .select("*")
        .eq("client_id", data.clientId)
        .eq("billing_status", "unbilled")
        .gte("incurred_on", data.periodStart)
        .lte("incurred_on", data.periodEnd),
      context.supabase
        .from("client_sows")
        .select("id, title, status")
        .eq("client_id", data.clientId)
        .eq("status", "active"),
    ]);

  const activeServices = new Set(
    ((entitlements ?? []) as any[])
      .filter((e) => ["included", "active"].includes(String(e.status)))
      .map((e) => String(e.service_key)),
  );

  const rateLines = ((pricing ?? []) as any[])
    .filter((p) => activeServices.has(String(p.service_key)))
    .filter((p) => !p.effective_date || p.effective_date <= data.periodEnd)
    .map((p, index) => ({
      source: "rate" as const,
      service_key: p.service_key,
      label: p.label ?? p.service_key,
      description: p.pricing_model ? `Contracted rate — ${p.pricing_model}` : "Contracted rate",
      quantity: 1,
      unit_cents: Number(p.contracted_cents ?? p.standard_cents ?? 0),
      amount_cents: Number(p.contracted_cents ?? p.standard_cents ?? 0),
      pricing_id: p.id,
      expense_id: null,
      offering_id: null,
      sort_order: index,
    }));

  const expenseLines = ((expenses ?? []) as any[]).map((e, index) => ({
    source: "expense" as const,
    service_key: null,
    label: e.description,
    description: `Third-party cost incurred ${e.incurred_on}`,
    quantity: 1,
    unit_cents: Number(e.amount_cents ?? 0),
    amount_cents: Number(e.amount_cents ?? 0),
    pricing_id: null,
    expense_id: e.id,
    offering_id: e.offering_id ?? null,
    sort_order: rateLines.length + index,
  }));

  const lines = [...rateLines, ...expenseLines];
  return {
    lines,
    totalCents: lines.reduce((s, l) => s + l.amount_cents, 0),
    activeSow: (sows ?? [])[0] ?? null,
    skipped: ((pricing ?? []) as any[]).filter((p) => !activeServices.has(String(p.service_key)))
      .length,
  };
}

/** Create a draft invoice from the client's contracted fees and active services. */
export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        sowId: z.string().uuid().nullable().optional(),
        periodStart: z.string().min(4).max(20),
        periodEnd: z.string().min(4).max(20),
        netDays: z.number().int().min(0).max(180).default(30),
        note: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
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
  const [{ data: lines }, { data: pricing }] = await Promise.all([
    context.supabase.from("invoice_lines").select("*").eq("invoice_id", invoiceId),
    context.supabase.from("client_pricing").select("*").eq("client_id", clientId),
  ]);
  const rateById = new Map(((pricing ?? []) as any[]).map((p) => [p.id, p]));
  const rateByKey = new Map(((pricing ?? []) as any[]).map((p) => [String(p.service_key), p]));

  const items = ((lines ?? []) as any[])
    .filter((l) => l.source !== "expense")
    .map((l) => {
      const rate = l.pricing_id
        ? rateById.get(l.pricing_id)
        : l.service_key
          ? rateByKey.get(String(l.service_key))
          : null;
      const contracted = rate ? Number(rate.contracted_cents ?? rate.standard_cents ?? 0) : null;
      const billed = Number(l.amount_cents ?? 0) ;
      const expected = contracted === null ? null : contracted * Number(l.quantity ?? 1);
      return {
        label: l.label as string,
        billedCents: billed,
        contractedCents: expected,
        varianceCents: expected === null ? billed : billed - expected,
        offRateCard: expected === null,
      };
    });

  const variance = items.reduce((s, i) => s + Math.max(0, i.varianceCents), 0);
  return { items, varianceCents: variance };
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

    const total = await recalcTotal(context, data.id);
    if (total <= 0) throw new Error("An invoice needs at least one payable line before it is issued.");

    const rates = await checkRates(context, data.id, (invoice as any).client_id);
    if (rates.varianceCents > 0 && !data.overrideReason) {
      throw new Error(
        "This invoice bills above the client's contracted rate. Record the written authorisation for the difference before issuing it.",
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
      })
      .eq("id", data.id);
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
      next: { total_cents: total, due_date: dueDate },
    });
    return { ok: true, number, dueDate };
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
    const { error } = await context.supabase
      .from("invoices")
      .update({ status: "paid", paid_on: data.paidOn, payment_reference: data.reference || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: "payment recorded",
      target: (invoice as any).number,
      clientId: (invoice as any).client_id,
      next: { paid_on: data.paidOn, reference: data.reference || null },
    });
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
    return {
      invoices: (invoices ?? []).map((inv: any) => ({
        ...inv,
        overdue: inv.status === "issued" && !!inv.due_date && inv.due_date < today,
        lines: lines.filter((l) => l.invoice_id === inv.id),
      })),
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
        "This invoice is above the contracted rate and has no recorded authorisation. Fix the rate before collecting payment.",
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
 *  This is their confirmation of the transfer — Harmonious still checks the money
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
