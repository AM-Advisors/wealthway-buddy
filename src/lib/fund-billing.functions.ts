import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

/** Fund-level money: each fund's wire fee and closing cost, the events that
 *  earn them, the invoice each one landed on, and the trail behind it. */

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
    area: "fund fee",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

const SETTLED = ["settled", "funded", "closed"];

async function buildEvents(context: any, offeringId: string) {
  const { data: offering } = await context.supabase
    .from("offerings")
    .select("*")
    .eq("id", offeringId)
    .maybeSingle();
  if (!offering) throw new Error("That fund isn't available.");

  const fundWire = Number((offering as any).wire_fee_cents ?? 0);
  const fundClosing = Number((offering as any).closing_cost_cents ?? 0);

  const [{ data: apps }, { data: closings }] = await Promise.all([
    context.supabase
      .from("investor_applications")
      .select("*")
      .eq("offering_id", offeringId)
      .order("created_at", { ascending: true }),
    context.supabase
      .from("application_closings")
      .select("*")
      .eq("offering_id", offeringId)
      .order("closing_date", { ascending: true }),
  ]);

  const appById = new Map(((apps ?? []) as any[]).map((a) => [String(a.id), a]));
  const nameOf = (a: any) =>
    a?.legal_name || a?.investor_name || a?.entity_name || a?.email || "Investor";

  const events: any[] = [];

  for (const a of ((apps ?? []) as any[])) {
    if (!SETTLED.includes(String(a.funding_status ?? ""))) continue;
    const cents = Number(a.wire_fee_cents ?? fundWire ?? 0);
    events.push({
      ref: `wire_fee:${a.id}`,
      kind: "wire_fee",
      kindLabel: "Wire fee",
      label: `Wire fee — ${nameOf(a)}`,
      description: `Investor funding settled by ${String(a.funding_method ?? "wire")}`,
      occurredOn: String(a.updated_at ?? a.created_at ?? "").slice(0, 10),
      cents,
      custom: a.wire_fee_cents != null && Number(a.wire_fee_cents) !== fundWire,
    });
  }

  const sharePrice = Number((offering as any).share_price_cents ?? 0);

  for (const c of ((closings ?? []) as any[])) {
    const app = appById.get(String(c.application_id));
    events.push({
      ref: `closing_cost:${c.id}`,
      kind: "closing_cost",
      kindLabel: "Closing cost",
      label: `Closing cost — ${nameOf(app)}`,
      description: `Closing recorded ${c.closing_date ?? ""}`.trim(),
      occurredOn: String(c.closing_date ?? c.created_at ?? "").slice(0, 10),
      cents: fundClosing,
      custom: false,
      rateMissing: fundClosing <= 0,
    });

    // Subscription: units bought at the fund's share price. With no share
    // price on file the funded amount stands on its own.
    const funded = Number(c.funded_amount_cents ?? app?.commitment_cents ?? 0);
    const units = sharePrice > 0 ? Math.floor(funded / sharePrice) : 0;
    const amount = sharePrice > 0 ? units * sharePrice : funded;
    const remainder = sharePrice > 0 ? funded - amount : 0;
    events.push({
      ref: `subscription:${c.id}`,
      kind: "subscription",
      kindLabel: "Subscription",
      label: `Subscription — ${nameOf(app)}`,
      description:
        sharePrice > 0
          ? `${units.toLocaleString()} units at $${(sharePrice / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} each` +
            (remainder > 0
              ? ` · $${(remainder / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} funded above whole units`
              : "")
          : "Funded amount — no share price set for this fund",
      occurredOn: String(c.closing_date ?? c.created_at ?? "").slice(0, 10),
      cents: amount,
      custom: false,
      units: sharePrice > 0 ? units : null,
      unitCents: sharePrice > 0 ? sharePrice : null,
      remainderCents: remainder,
      rateMissing: sharePrice <= 0,
    });
  }

  return { offering, events, fundWire, fundClosing, sharePrice };
}

/** One fund's fee position: what is billable, what is invoiced, what is paid. */
export const getFundBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireStaff(context);
    const { offering, events, fundWire, fundClosing } = await buildEvents(
      context,
      data.offeringId,
    );

    const clientId = (offering as any).client_id ?? null;
    let clientName: string | null = null;
    if (clientId) {
      const { data: client } = await context.supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .maybeSingle();
      clientName = (client as any)?.name ?? null;
    }

    const refs = events.map((e) => e.ref);
    let lines: any[] = [];
    if (refs.length) {
      const { data: lineRows } = await context.supabase
        .from("invoice_lines")
        .select("id, invoice_id, source_ref, amount_cents, label")
        .in("source_ref", refs);
      lines = lineRows ?? [];
    }

    const invoiceIds = Array.from(new Set(lines.map((l) => String(l.invoice_id))));
    let invoices: any[] = [];
    if (invoiceIds.length) {
      const { data: invRows } = await context.supabase
        .from("invoices")
        .select("id, number, status, approval_status, due_date, paid_on, total_cents, issued_at")
        .in("id", invoiceIds);
      invoices = invRows ?? [];
    }
    const invoiceById = new Map(invoices.map((i: any) => [String(i.id), i]));

    const priced = events.map((e) => {
      const line = lines.find((l) => String(l.source_ref) === e.ref) ?? null;
      const invoice = line ? (invoiceById.get(String(line.invoice_id)) ?? null) : null;
      const state = !invoice
        ? "unbilled"
        : invoice.status === "paid"
          ? "paid"
          : invoice.status === "void"
            ? "unbilled"
            : invoice.status === "issued"
              ? "invoiced"
              : "drafted";
      return {
        ...e,
        billedCents: line ? Number(line.amount_cents ?? 0) : null,
        state,
        invoice: invoice
          ? {
              id: invoice.id,
              number: invoice.number,
              status: invoice.status,
              approvalStatus: invoice.approval_status,
              dueDate: invoice.due_date,
              paidOn: invoice.paid_on,
            }
          : null,
      };
    });

    const sum = (f: (e: any) => boolean) =>
      priced.filter(f).reduce((s, e) => s + Number(e.cents ?? 0), 0);

    const { data: trail } = await context.supabase
      .from("contract_audit_events")
      .select("id, area, action, target, actor_role, created_at, new_value")
      .eq("offering_id", data.offeringId)
      .in("area", ["fund fee", "invoice", "payment"])
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: sows } = clientId
      ? await context.supabase
          .from("client_sows")
          .select("id, title, status")
          .eq("client_id", clientId)
          .eq("status", "active")
      : { data: [] as any[] };

    return {
      canManage: who.canManage,
      fund: {
        id: (offering as any).id,
        name: (offering as any).name,
        wireFeeCents: fundWire,
        closingCostCents: fundClosing,
        wireFeeSource: String((offering as any).wire_fee_source ?? "custom"),
        closingCostSource: String((offering as any).closing_cost_source ?? "custom"),
      },
      clientId,
      clientName,
      activeSow: ((sows ?? []) as any[])[0] ?? null,
      events: priced,
      totals: {
        unbilledCents: sum((e) => e.state === "unbilled"),
        draftedCents: sum((e) => e.state === "drafted"),
        invoicedCents: sum((e) => e.state === "invoiced"),
        paidCents: sum((e) => e.state === "paid"),
      },
      trail: trail ?? [],
    };
  });

/** Put the fund's unbilled wire fees and closing costs on a draft invoice. */
export const billFundFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        refs: z.array(z.string().min(3).max(120)).min(1),
        netDays: z.number().int().min(0).max(180).default(30),
        note: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    if (!who.canManage) {
      throw new Error(
        "Forbidden: preparing invoices needs legal, compliance, finance, client success or admin authority.",
      );
    }

    const { offering, events } = await buildEvents(context, data.offeringId);
    const clientId = (offering as any).client_id ?? null;
    if (!clientId) {
      throw new Error(
        "This fund is not linked to a client yet, so its fees cannot be invoiced. Attach the client and its statement of work first.",
      );
    }

    const chosen = events.filter((e) => data.refs.includes(e.ref));
    if (!chosen.length) throw new Error("Nothing selected to bill.");
    if (chosen.some((e) => Number(e.cents ?? 0) <= 0)) {
      throw new Error(
        "One of these fees is set to zero. Set the fund's wire fee and closing cost from the agreed rates first.",
      );
    }

    const { data: already } = await context.supabase
      .from("invoice_lines")
      .select("source_ref")
      .in(
        "source_ref",
        chosen.map((e) => e.ref),
      );
    const taken = new Set(((already ?? []) as any[]).map((l) => String(l.source_ref)));
    const toBill = chosen.filter((e) => !taken.has(e.ref));
    if (!toBill.length) throw new Error("Those fees are already on an invoice.");

    const dates = toBill.map((e) => e.occurredOn).filter(Boolean).sort();
    const periodStart = dates[0] ?? new Date().toISOString().slice(0, 10);
    const periodEnd = dates[dates.length - 1] ?? periodStart;

    const { data: sow } = await context.supabase
      .from("client_sows")
      .select("id")
      .eq("client_id", clientId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const total = toBill.reduce((s, e) => s + Number(e.cents ?? 0), 0);

    // Tie each fee back to the client's agreed rate line so the rate check on
    // issuing compares like with like instead of treating it as off rate card.
    const { resolveClientRates } = await import("@/lib/fee-rates.server");
    const clientRates = await resolveClientRates(context.supabase, clientId);

    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .insert({
        client_id: clientId,
        sow_id: (sow as any)?.id ?? null,
        period_start: periodStart,
        period_end: periodEnd,
        net_days: data.netDays,
        note: data.note || `Fund fees — ${(offering as any).name}`,
        status: "draft",
        total_cents: total,
        created_by: who.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { error: lineError } = await context.supabase.from("invoice_lines").insert(
      toBill.map((e, index) => ({
        invoice_id: (invoice as any).id,
        source: "fund_fee",
        source_ref: e.ref,
        service_key: e.kind,
        pricing_id: (clientRates as any)[e.kind]?.id ?? null,
        label: e.label,
        description: e.description,
        quantity: 1,
        unit_cents: e.cents,
        amount_cents: e.cents,
        offering_id: data.offeringId,
        sort_order: index,
      })),
    );
    if (lineError) throw new Error(lineError.message);

    await audit(context, who, {
      action: "fees added to draft invoice",
      target: (offering as any).name,
      clientId,
      offeringId: data.offeringId,
      next: {
        invoice_id: (invoice as any).id,
        lines: toBill.length,
        total_cents: total,
        refs: toBill.map((e) => e.ref),
      },
    });

    return { ok: true, invoiceId: (invoice as any).id, lines: toBill.length, totalCents: total };
  });
