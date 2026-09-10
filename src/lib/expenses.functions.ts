import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

export const BILLING_STATUSES = [
  { value: "unbilled", label: "Not yet billed" },
  { value: "billed", label: "Billed to client" },
  { value: "absorbed", label: "Absorbed by Harmonious" },
  { value: "waived", label: "Waived" },
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
      "Forbidden: recording or changing pass-through costs needs legal, compliance, finance, client success or admin authority.",
    );
  }
  return who;
}

async function audit(
  context: any,
  who: Who,
  entry: {
    area: string;
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
    area: entry.area,
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

/** Actual third-party costs, the pass-through rate lines they relate to, and the
 *  reference data the expenses screen needs. */
export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const [
      { data: expenses, error },
      { data: providers },
      { data: clients },
      { data: funds },
      { data: items },
      { data: versions },
    ] = await Promise.all([
      context.supabase
        .from("pass_through_expenses")
        .select("*")
        .order("incurred_on", { ascending: false })
        .limit(500),
      context.supabase.from("third_party_providers").select("id, name, retired_at").order("name"),
      context.supabase.from("clients").select("id, name").order("name"),
      context.supabase.from("offerings").select("id, name, client_id").order("name"),
      context.supabase.from("pricing_items").select("*").eq("pass_through", true).order("sort_order"),
      context.supabase.from("pricing_versions").select("id, label, status"),
    ]);
    if (error) throw new Error(error.message);

    const itemById = new Map((items ?? []).map((i: any) => [i.id, i]));
    const versionById = new Map((versions ?? []).map((v: any) => [v.id, v]));
    const providerById = new Map((providers ?? []).map((p: any) => [p.id, p]));
    const clientById = new Map((clients ?? []).map((c: any) => [c.id, c]));
    const fundById = new Map((funds ?? []).map((f: any) => [f.id, f]));

    return {
      canManage: who.canManage,
      expenses: (expenses ?? []).map((e: any) => {
        const item = e.pricing_item_id ? itemById.get(e.pricing_item_id) : null;
        return {
          ...e,
          providerName: providerById.get(e.provider_id)?.name ?? null,
          clientName: clientById.get(e.client_id)?.name ?? null,
          fundName: fundById.get(e.offering_id)?.name ?? null,
          rateLabel: item?.label ?? null,
          rateAmountCents: item?.amount_cents ?? null,
          variance:
            item && typeof item.amount_cents === "number"
              ? Number(e.amount_cents) - Number(item.amount_cents)
              : null,
        };
      }),
      providers: providers ?? [],
      clients: clients ?? [],
      funds: funds ?? [],
      rateLines: (items ?? []).map((i: any) => ({
        ...i,
        versionLabel: versionById.get(i.version_id)?.label ?? null,
        versionStatus: versionById.get(i.version_id)?.status ?? null,
      })),
    };
  });

export const saveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        clientId: z.string().uuid().nullable().optional(),
        offeringId: z.string().uuid().nullable().optional(),
        providerId: z.string().uuid().nullable().optional(),
        pricingItemId: z.string().uuid().nullable().optional(),
        description: z.string().trim().min(2).max(200),
        amountCents: z.number().int().min(0),
        currency: z.string().max(8).default("USD"),
        incurredOn: z.string().min(4).max(20),
        reference: z.string().max(120).optional().or(z.literal("")),
        note: z.string().max(1000).optional().or(z.literal("")),
        billingStatus: z.string().max(30).default("unbilled"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const row = {
      client_id: data.clientId ?? null,
      offering_id: data.offeringId ?? null,
      provider_id: data.providerId ?? null,
      pricing_item_id: data.pricingItemId ?? null,
      description: data.description,
      amount_cents: data.amountCents,
      currency: data.currency || "USD",
      incurred_on: data.incurredOn,
      reference: data.reference || null,
      note: data.note || null,
      billing_status: data.billingStatus,
      recorded_by: who.userId,
    };

    let previous: any = null;
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("pass_through_expenses")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      previous = existing ?? null;
      const { error } = await context.supabase
        .from("pass_through_expenses")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("pass_through_expenses").insert(row);
      if (error) throw new Error(error.message);
    }

    await audit(context, who, {
      area: "expense",
      action: data.id ? "cost updated" : "cost recorded",
      target: data.description,
      clientId: data.clientId ?? null,
      offeringId: data.offeringId ?? null,
      previous,
      next: row,
    });
    return { ok: true };
  });

export const setExpenseBillingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), billingStatus: z.string().min(2).max(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: existing } = await context.supabase
      .from("pass_through_expenses")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("That cost record isn't available.");
    const { error } = await context.supabase
      .from("pass_through_expenses")
      .update({ billing_status: data.billingStatus })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "expense",
      action: "billing status changed",
      target: (existing as any).description,
      clientId: (existing as any).client_id,
      offeringId: (existing as any).offering_id,
      previous: { billing_status: (existing as any).billing_status },
      next: { billing_status: data.billingStatus },
    });
    return { ok: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: existing } = await context.supabase
      .from("pass_through_expenses")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("That cost record isn't available.");
    const { error } = await context.supabase.from("pass_through_expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "expense",
      action: "cost removed",
      target: (existing as any).description,
      clientId: (existing as any).client_id,
      offeringId: (existing as any).offering_id,
      previous: existing,
    });
    return { ok: true };
  });

/** Retire or reinstate a provider. Records are never deleted so the history stays intact. */
export const setProviderRetired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), retired: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: existing } = await context.supabase
      .from("third_party_providers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("That provider isn't available.");
    const next = {
      retired_at: data.retired ? new Date().toISOString() : null,
      status: data.retired ? "retired" : "operational",
    };
    const { error } = await context.supabase
      .from("third_party_providers")
      .update(next)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "provider",
      action: data.retired ? "retired" : "reinstated",
      target: (existing as any).name,
      previous: { retired_at: (existing as any).retired_at, status: (existing as any).status },
      next,
    });
    return { ok: true };
  });
