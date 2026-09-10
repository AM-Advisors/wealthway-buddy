import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

/** Where each fund's wire fee and closing cost come from, and whether they
 *  still match the client's agreed rates. */

async function whoIs(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
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

/** The rate options available to one fund, plus what it uses today. */
export const getFundFeeRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireStaff(context);
    const { FUND_FEE_KINDS, resolveFeeRates } = await import("@/lib/fee-rates.server");

    const { data: offering } = await context.supabase
      .from("offerings")
      .select("*")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (!offering) throw new Error("That fund isn't available.");

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

    const rates = await resolveFeeRates(context.supabase, clientId);

    return {
      canManage: who.canManage,
      clientId,
      clientName,
      kinds: FUND_FEE_KINDS.map((kind) => ({
        key: kind.key,
        label: kind.label,
        current: {
          cents: Number((offering as any)[kind.amountColumn] ?? 0),
          source: String((offering as any)[kind.sourceColumn] ?? "custom"),
          rateId: (offering as any)[kind.rateColumn] ?? null,
          reason: (offering as any)[kind.reasonColumn] ?? null,
        },
        clientRate: rates.client[kind.key] ?? null,
        standardRate: rates.standard[kind.key] ?? null,
      })),
    };
  });

/** Every fund whose fees no longer match the client's agreed rates. */
export const listFundFeeSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const { FUND_FEE_KINDS, resolveFeeRates } = await import("@/lib/fee-rates.server");

    const { data: offerings } = await context.supabase
      .from("offerings")
      .select("*")
      .order("name", { ascending: true });

    const { data: clients } = await context.supabase.from("clients").select("id, name");
    const clientNames = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));

    const cache = new Map<string, any>();
    const rows: any[] = [];

    for (const offering of ((offerings ?? []) as any[])) {
      const clientId = offering.client_id ?? null;
      const cacheKey = clientId ?? "none";
      if (!cache.has(cacheKey)) cache.set(cacheKey, await resolveFeeRates(context.supabase, clientId));
      const rates = cache.get(cacheKey);

      for (const kind of FUND_FEE_KINDS) {
        const current = Number(offering[kind.amountColumn] ?? 0);
        const source = String(offering[kind.sourceColumn] ?? "custom");
        const clientRate = rates.client[kind.key] ?? null;
        const standardRate = rates.standard[kind.key] ?? null;
        const agreed = clientRate?.cents ?? null;

        rows.push({
          offeringId: offering.id,
          fundName: offering.name,
          clientId,
          clientName: clientId ? (clientNames.get(clientId) ?? null) : null,
          kind: kind.key,
          kindLabel: kind.label,
          cents: current,
          source,
          reason: offering[kind.reasonColumn] ?? null,
          agreedCents: agreed,
          standardCents: standardRate?.cents ?? null,
          differenceCents: agreed === null ? null : current - agreed,
          matches: agreed === null ? null : current === agreed,
        });
      }
    }

    return { canManage: who.canManage, rows };
  });

/** Point a fund's fee at a rate, or set a one-off rate with a reason. */
export const setFundFeeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        kind: z.enum(["wire_fee", "closing_cost"]),
        source: z.enum(["client_rate", "standard", "custom"]),
        cents: z.number().int().min(0).optional(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    if (!who.canManage) {
      throw new Error(
        "Forbidden: changing contracted scope, pricing or entitlements needs legal, compliance, finance, client success or admin authority.",
      );
    }

    const { FUND_FEE_KINDS, resolveFeeRates } = await import("@/lib/fee-rates.server");
    const kind = FUND_FEE_KINDS.find((k) => k.key === data.kind)!;

    const { data: offering } = await context.supabase
      .from("offerings")
      .select("*")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (!offering) throw new Error("That fund isn't available.");

    const rates = await resolveFeeRates(context.supabase, (offering as any).client_id ?? null);
    const clientRate = rates.client[data.kind] ?? null;
    const standardRate = rates.standard[data.kind] ?? null;

    let cents: number;
    let rateId: string | null = null;
    let reason: string | null = null;

    if (data.source === "client_rate") {
      if (!clientRate || clientRate.cents === null) {
        throw new Error("This client has no agreed rate recorded for that fee yet.");
      }
      cents = clientRate.cents;
      rateId = clientRate.id;
    } else if (data.source === "standard") {
      if (!standardRate || standardRate.cents === null) {
        throw new Error("The published rate card has no line for that fee yet.");
      }
      cents = standardRate.cents;
    } else {
      if (data.cents === undefined) throw new Error("Enter the amount for this fund.");
      if (!data.reason || data.reason.length < 3) {
        throw new Error("Say why this fund uses a rate of its own.");
      }
      cents = data.cents;
      reason = data.reason;
    }

    const patch: Record<string, unknown> = {
      [kind.amountColumn]: cents,
      [kind.sourceColumn]: data.source,
      [kind.rateColumn]: rateId,
      [kind.reasonColumn]: reason,
    };

    const { error } = await context.supabase
      .from("offerings")
      .update(patch as any)
      .eq("id", data.offeringId);
    if (error) throw new Error(error.message);

    await context.supabase.from("contract_audit_events").insert({
      actor_id: who.userId,
      actor_role: who.roles.join(", ") || null,
      client_id: (offering as any).client_id ?? null,
      offering_id: data.offeringId,
      area: "pricing",
      action: "fund fee rate set",
      target: kind.label,
      previous_value: {
        cents: Number((offering as any)[kind.amountColumn] ?? 0),
        source: (offering as any)[kind.sourceColumn] ?? "custom",
      } as any,
      new_value: { cents, source: data.source, reason } as any,
      source: "web",
    });

    return { ok: true, cents };
  });

/** Suggested fee for a service request, from the client's agreed rates first. */
export const getServiceRateSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), serviceKey: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);

    const [{ data: pricing }, { data: sows }] = await Promise.all([
      context.supabase.from("client_pricing").select("*").eq("client_id", data.clientId),
      context.supabase.from("client_sows").select("id, status").eq("client_id", data.clientId),
    ]);
    const activeSows = new Set(
      ((sows ?? []) as any[]).filter((s) => s.status === "active").map((s) => s.id),
    );
    const clientRow = ((pricing ?? []) as any[])
      .filter((r) => r.service_key === data.serviceKey)
      .filter((r) => !r.sow_id || activeSows.has(r.sow_id))
      .sort((a, b) => String(b.effective_date ?? "").localeCompare(String(a.effective_date ?? "")))[0];

    if (clientRow) {
      return {
        source: "client_rate" as const,
        rateId: clientRow.id as string,
        label: clientRow.label as string,
        cents: (clientRow.contracted_cents ?? clientRow.standard_cents ?? null) as number | null,
        pricingModel: (clientRow.pricing_model ?? null) as string | null,
      };
    }

    const { data: version } = await context.supabase
      .from("pricing_versions")
      .select("id, label")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (version) {
      const { data: item } = await context.supabase
        .from("pricing_items")
        .select("*")
        .eq("version_id", (version as any).id)
        .eq("service_key", data.serviceKey)
        .maybeSingle();
      if (item) {
        return {
          source: "standard" as const,
          rateId: null,
          label: `${(item as any).label} · ${(version as any).label}`,
          cents: ((item as any).amount_cents ?? null) as number | null,
          pricingModel: ((item as any).pricing_model ?? null) as string | null,
        };
      }
    }

    return { source: null, rateId: null, label: null, cents: null, pricingModel: null };
  });
