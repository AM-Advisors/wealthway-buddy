import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STAFF_ROLES } from "@/lib/contracts.functions";

/** Cap table management for founder clients: their own stakeholders, share
 *  holdings and transfers between holders. Harmonious keeps the record and the
 *  audit trail; the client's own authorised people approve each transfer. */

export const SECURITY_TYPES = [
  { value: "common", label: "Common shares" },
  { value: "preferred", label: "Preferred shares" },
  { value: "option", label: "Options" },
  { value: "warrant", label: "Warrants" },
  { value: "safe", label: "SAFE" },
  { value: "note", label: "Convertible note" },
  { value: "membership", label: "Membership interest" },
] as const;

export const HOLDER_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "entity", label: "Entity" },
  { value: "fund", label: "Fund" },
  { value: "employee", label: "Employee" },
] as const;

/** Stakeholder allowance by cap table plan. Null means unlimited. */
export const PLAN_LIMITS: Record<string, { label: string; stakeholders: number | null }> = {
  cap_table_free: { label: "Free", stakeholders: 5 },
  cap_table_starter: { label: "Starter", stakeholders: 25 },
  cap_table_growth: { label: "Growth", stakeholders: 50 },
  cap_table_scale: { label: "Scale", stakeholders: null },
  cap_table_enterprise: { label: "Enterprise", stakeholders: null },
};

const APPROVER_ROLES = ["client_gp", "client_signatory", "client_legal", "client_finance"];

type Access = {
  clientIds: string[];
  clientId: string | null;
  role: string | null;
  canEdit: boolean;
  canApprove: boolean;
};

async function access(context: any, wanted?: string | null): Promise<Access> {
  const { data } = await context.supabase
    .from("client_users")
    .select("client_id, client_role")
    .eq("user_id", context.userId);
  const rows = ((data ?? []) as any[]).map((r) => ({
    clientId: String(r.client_id),
    role: String(r.client_role ?? ""),
  }));
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const clientId = wanted && clientIds.includes(wanted) ? wanted : (clientIds[0] ?? null);
  const role = rows.find((r) => r.clientId === clientId)?.role ?? null;
  return {
    clientIds,
    clientId,
    role,
    canEdit: Boolean(role) && role !== "client_readonly",
    canApprove: Boolean(role) && APPROVER_ROLES.includes(role ?? ""),
  };
}

async function audit(
  context: any,
  entry: { clientId: string; action: string; target?: string | null; next?: unknown },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: context.userId,
    client_id: entry.clientId,
    area: "cap_table",
    action: entry.action,
    target: entry.target ?? null,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

function planFor(entitlementKeys: string[]) {
  const order = [
    "cap_table_enterprise",
    "cap_table_scale",
    "cap_table_growth",
    "cap_table_starter",
    "cap_table_free",
  ];
  const key = order.find((k) => entitlementKeys.includes(k)) ?? null;
  return key ? { key, ...PLAN_LIMITS[key]! } : null;
}

/* -------------------------------------------------------------- client read */

export const getFounderCapTable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId ?? null);
    if (!who.clientId) {
      return {
        clientId: null,
        canEdit: false,
        canApprove: false,
        plan: null,
        stakeholders: [],
        holdings: [],
        transfers: [],
      };
    }

    const [{ data: stakeholders }, { data: holdings }, { data: transfers }, { data: ents }] =
      await Promise.all([
        context.supabase
          .from("cap_stakeholders")
          .select("*")
          .eq("client_id", who.clientId)
          .order("name"),
        context.supabase
          .from("cap_holdings")
          .select("*")
          .eq("client_id", who.clientId)
          .order("created_at", { ascending: false }),
        context.supabase
          .from("cap_transfers")
          .select("*")
          .eq("client_id", who.clientId)
          .order("created_at", { ascending: false })
          .limit(200),
        context.supabase
          .from("service_entitlements")
          .select("service_key, status")
          .eq("client_id", who.clientId),
      ]);

    const includedKeys = ((ents ?? []) as any[])
      .filter((e) => e.status === "included")
      .map((e) => String(e.service_key));

    return {
      clientId: who.clientId,
      canEdit: who.canEdit,
      canApprove: who.canApprove,
      plan: planFor(includedKeys),
      stakeholders: (stakeholders ?? []) as any[],
      holdings: (holdings ?? []) as any[],
      transfers: (transfers ?? []) as any[],
    };
  });

/* ------------------------------------------------------------- client write */

const stakeholderInput = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  email: z.string().email().optional().nullable().or(z.literal("")),
  holder_type: z.string().min(1).default("individual"),
  notes: z.string().optional().nullable(),
});

export const saveStakeholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => stakeholderInput.parse(d))
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId);
    if (!who.clientId || who.clientId !== data.clientId || !who.canEdit) {
      throw new Error("You do not have permission to change this cap table.");
    }
    await assertStakeholderRoom(context, who.clientId, data.id ? 0 : 1);

    const row = {
      client_id: who.clientId,
      name: data.name.trim(),
      email: data.email ? String(data.email).trim() : null,
      holder_type: data.holder_type,
      notes: data.notes ?? null,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("cap_stakeholders")
        .update(row)
        .eq("id", data.id)
        .eq("client_id", who.clientId);
      if (error) throw new Error(error.message);
      await audit(context, {
        clientId: who.clientId,
        action: "stakeholder_updated",
        target: data.id,
        next: row,
      });
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("cap_stakeholders")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, {
      clientId: who.clientId,
      action: "stakeholder_added",
      target: String((created as any).id),
      next: row,
    });
    return { id: String((created as any).id) };
  });

async function assertStakeholderRoom(context: any, clientId: string, adding: number) {
  if (adding <= 0) return;
  const [{ count }, { data: ents }] = await Promise.all([
    context.supabase
      .from("cap_stakeholders")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId),
    context.supabase
      .from("service_entitlements")
      .select("service_key, status")
      .eq("client_id", clientId),
  ]);
  const plan = planFor(
    ((ents ?? []) as any[]).filter((e) => e.status === "included").map((e) => String(e.service_key)),
  );
  if (!plan) {
    throw new Error(
      "This service is not currently included in your active scope. Request service.",
    );
  }
  if (plan.stakeholders != null && (count ?? 0) + adding > plan.stakeholders) {
    throw new Error(
      `Your ${plan.label} plan covers ${plan.stakeholders} stakeholders. Request an upgrade to add more.`,
    );
  }
}

const holdingInput = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid().optional().nullable(),
  stakeholder_id: z.string().uuid(),
  security_type: z.string().min(1).default("common"),
  share_class: z.string().optional().nullable(),
  quantity: z.number().nonnegative(),
  price_per_share_cents: z.number().int().nonnegative().optional().nullable(),
  issued_on: z.string().optional().nullable(),
  certificate_no: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const saveHolding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => holdingInput.parse(d))
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId);
    if (!who.clientId || who.clientId !== data.clientId || !who.canEdit) {
      throw new Error("You do not have permission to change this cap table.");
    }
    const row = {
      client_id: who.clientId,
      stakeholder_id: data.stakeholder_id,
      security_type: data.security_type,
      share_class: data.share_class || null,
      quantity: data.quantity,
      price_per_share_cents: data.price_per_share_cents ?? null,
      issued_on: data.issued_on || null,
      certificate_no: data.certificate_no || null,
      notes: data.notes || null,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("cap_holdings")
        .update(row)
        .eq("id", data.id)
        .eq("client_id", who.clientId);
      if (error) throw new Error(error.message);
      await audit(context, {
        clientId: who.clientId,
        action: "holding_updated",
        target: data.id,
        next: row,
      });
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("cap_holdings")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Every new share record gets its own numbered certificate, in draft until
    // a company signatory signs it.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createDraftCertificate } = await import("@/lib/cap-certificates.server");
    await createDraftCertificate(supabaseAdmin, {
      holdingId: String((created as any).id),
      createdBy: context.userId,
    });

    await audit(context, {
      clientId: who.clientId,
      action: "holding_added",
      target: String((created as any).id),
      next: row,
    });
    return { id: String((created as any).id) };
  });


/** Bulk upload: each line carries a holder plus the shares they hold. */
const importInput = z.object({
  clientId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().optional().nullable(),
        holder_type: z.string().optional().nullable(),
        security_type: z.string().optional().nullable(),
        share_class: z.string().optional().nullable(),
        quantity: z.number().nonnegative(),
        price_per_share_cents: z.number().int().nonnegative().optional().nullable(),
        issued_on: z.string().optional().nullable(),
        certificate_no: z.string().optional().nullable(),
      }),
    )
    .min(1)
    .max(1000),
});

export const importCapTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importInput.parse(d))
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId);
    if (!who.clientId || who.clientId !== data.clientId || !who.canEdit) {
      throw new Error("You do not have permission to change this cap table.");
    }

    const { data: existing } = await context.supabase
      .from("cap_stakeholders")
      .select("id, name, email")
      .eq("client_id", who.clientId);

    const byKey = new Map(
      ((existing ?? []) as any[]).map((s) => [
        String(s.email || s.name).trim().toLowerCase(),
        String(s.id),
      ]),
    );

    const newKeys = new Set<string>();
    for (const r of data.rows) {
      const key = String(r.email || r.name).trim().toLowerCase();
      if (!byKey.has(key)) newKeys.add(key);
    }
    await assertStakeholderRoom(context, who.clientId, newKeys.size);

    let holders = 0;
    let holdings = 0;
    for (const r of data.rows) {
      const key = String(r.email || r.name).trim().toLowerCase();
      let stakeholderId = byKey.get(key);
      if (!stakeholderId) {
        const { data: created, error } = await context.supabase
          .from("cap_stakeholders")
          .insert({
            client_id: who.clientId,
            name: r.name.trim(),
            email: r.email ? String(r.email).trim() : null,
            holder_type: r.holder_type || "individual",
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        stakeholderId = String((created as any).id);
        byKey.set(key, stakeholderId);
        holders += 1;
      }
      const { data: newHolding, error: hErr } = await context.supabase
        .from("cap_holdings")
        .insert({
          client_id: who.clientId,
          stakeholder_id: stakeholderId,
          security_type: r.security_type || "common",
          share_class: r.share_class || null,
          quantity: r.quantity,
          price_per_share_cents: r.price_per_share_cents ?? null,
          issued_on: r.issued_on || null,
          certificate_no: r.certificate_no || null,
          source: "upload",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (hErr) throw new Error(hErr.message);
      await createDraftCertificate(admin, {
        holdingId: String((newHolding as any).id),
        createdBy: context.userId,
      });
      holdings += 1;
    }


    await audit(context, {
      clientId: who.clientId,
      action: "cap_table_imported",
      next: { holders, holdings },
    });
    return { holders, holdings };
  });

/* --------------------------------------------------------------- transfers */

const transferInput = z.object({
  clientId: z.string().uuid(),
  holding_id: z.string().uuid(),
  to_stakeholder_id: z.string().uuid().optional().nullable(),
  to_name: z.string().optional().nullable(),
  to_email: z.string().optional().nullable(),
  quantity: z.number().positive(),
  reason: z.string().optional().nullable(),
});

export const requestTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => transferInput.parse(d))
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId);
    if (!who.clientId || who.clientId !== data.clientId || !who.canEdit) {
      throw new Error("You do not have permission to change this cap table.");
    }
    if (!data.to_stakeholder_id && !data.to_name) {
      throw new Error("Say who the shares go to.");
    }

    const { data: holding } = await context.supabase
      .from("cap_holdings")
      .select("id, client_id, stakeholder_id, quantity, status")
      .eq("id", data.holding_id)
      .eq("client_id", who.clientId)
      .maybeSingle();
    if (!holding) throw new Error("That holding no longer exists.");
    if ((holding as any).status !== "outstanding") {
      throw new Error("Only outstanding holdings can be transferred.");
    }
    if (data.quantity > Number((holding as any).quantity)) {
      throw new Error("The transfer is larger than the holding.");
    }

    const { data: created, error } = await context.supabase
      .from("cap_transfers")
      .insert({
        client_id: who.clientId,
        holding_id: data.holding_id,
        from_stakeholder_id: (holding as any).stakeholder_id,
        to_stakeholder_id: data.to_stakeholder_id ?? null,
        to_name: data.to_name || null,
        to_email: data.to_email || null,
        quantity: data.quantity,
        reason: data.reason || null,
        requested_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await audit(context, {
      clientId: who.clientId,
      action: "transfer_requested",
      target: String((created as any).id),
      next: { quantity: data.quantity, holding: data.holding_id },
    });
    return { id: String((created as any).id) };
  });

export const decideTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId);
    if (!who.clientId || who.clientId !== data.clientId || !who.canApprove) {
      throw new Error(
        "Approving a transfer needs signing, GP, legal or finance authority on this account.",
      );
    }

    const { data: transfer } = await context.supabase
      .from("cap_transfers")
      .select("*")
      .eq("id", data.id)
      .eq("client_id", who.clientId)
      .maybeSingle();
    if (!transfer) throw new Error("That transfer no longer exists.");
    if ((transfer as any).status !== "pending") throw new Error("That transfer is already decided.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.decision === "approved") {
      const { data: holding } = await supabaseAdmin
        .from("cap_holdings")
        .select("*")
        .eq("id", (transfer as any).holding_id)
        .maybeSingle();
      if (!holding) throw new Error("The holding behind this transfer no longer exists.");

      const moving = Number((transfer as any).quantity);
      const remaining = Number((holding as any).quantity) - moving;
      if (remaining < 0) throw new Error("The transfer is larger than the holding.");

      let toId = (transfer as any).to_stakeholder_id as string | null;
      if (!toId) {
        const { data: created, error } = await supabaseAdmin
          .from("cap_stakeholders")
          .insert({
            client_id: who.clientId,
            name: (transfer as any).to_name ?? "New holder",
            email: (transfer as any).to_email ?? null,
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        toId = String((created as any).id);
      }

      await supabaseAdmin
        .from("cap_holdings")
        .update({
          quantity: remaining,
          status: remaining === 0 ? "transferred" : "outstanding",
        })
        .eq("id", (holding as any).id);

      const { error: insErr } = await supabaseAdmin.from("cap_holdings").insert({
        client_id: who.clientId,
        stakeholder_id: toId,
        security_type: (holding as any).security_type,
        share_class: (holding as any).share_class,
        quantity: moving,
        price_per_share_cents: (holding as any).price_per_share_cents,
        issued_on: new Date().toISOString().slice(0, 10),
        certificate_no: null,
        source: "transfer",
        notes: `Transferred from holding ${(holding as any).id}`,
        created_by: context.userId,
      });
      if (insErr) throw new Error(insErr.message);
    }

    const { error: updErr } = await supabaseAdmin
      .from("cap_transfers")
      .update({
        status: data.decision,
        decision_note: data.note || null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    await audit(context, {
      clientId: who.clientId,
      action: `transfer_${data.decision}`,
      target: data.id,
      next: { note: data.note ?? null },
    });
    return { ok: true };
  });

/* ------------------------------------------------------------ staff usage */

export const getCapTablePlanUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));
    if (!roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
      throw new Error("Forbidden: this area is for the Harmonious team.");
    }

    const [{ data: clients }, { data: ents }, { data: stakeholders }, { data: holdings }, { data: transfers }] =
      await Promise.all([
        context.supabase.from("clients").select("id, name, status").order("name"),
        context.supabase
          .from("service_entitlements")
          .select("client_id, service_key, status, effective_date")
          .like("service_key", "cap_table%"),
        context.supabase.from("cap_stakeholders").select("client_id"),
        context.supabase.from("cap_holdings").select("client_id, quantity, status, updated_at"),
        context.supabase.from("cap_transfers").select("client_id, status, updated_at"),
      ]);

    const included = new Map<string, string[]>();
    for (const e of (ents ?? []) as any[]) {
      if (e.status !== "included") continue;
      const list = included.get(String(e.client_id)) ?? [];
      list.push(String(e.service_key));
      included.set(String(e.client_id), list);
    }

    const rows = ((clients ?? []) as any[])
      .map((c) => {
        const clientId = String(c.id);
        const plan = planFor(included.get(clientId) ?? []);
        const holders = ((stakeholders ?? []) as any[]).filter(
          (s) => String(s.client_id) === clientId,
        ).length;
        const clientHoldings = ((holdings ?? []) as any[]).filter(
          (h) => String(h.client_id) === clientId,
        );
        const clientTransfers = ((transfers ?? []) as any[]).filter(
          (t) => String(t.client_id) === clientId,
        );
        const lastActivity = [...clientHoldings, ...clientTransfers]
          .map((r) => String(r.updated_at ?? ""))
          .sort()
          .pop();
        return {
          clientId,
          clientName: String(c.name),
          clientStatus: String(c.status ?? ""),
          plan,
          stakeholders: holders,
          holdings: clientHoldings.length,
          shares: clientHoldings
            .filter((h) => h.status === "outstanding")
            .reduce((sum, h) => sum + Number(h.quantity ?? 0), 0),
          pendingTransfers: clientTransfers.filter((t) => t.status === "pending").length,
          lastActivity: lastActivity || null,
          overLimit:
            plan?.stakeholders != null && holders > plan.stakeholders
              ? holders - plan.stakeholders
              : 0,
        };
      })
      .filter((r) => r.plan || r.stakeholders > 0);

    return { rows };
  });
