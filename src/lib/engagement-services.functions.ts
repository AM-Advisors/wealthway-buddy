import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { whoIsStaff, workflowPath } from "@/lib/service-catalog.functions";

export const CHANGE_TYPES = [
  { value: "service_addition", label: "Add a service" },
  { value: "service_removal", label: "Cancel a service" },
  { value: "scope_change", label: "Change scope" },
  { value: "commercial_change", label: "Change commercial terms" },
] as const;

export const CHANGE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "requested", label: "Requested" },
  { value: "quoted", label: "Quoted" },
  { value: "declined", label: "Declined" },
  { value: "client_signed", label: "Signed by client" },
  { value: "executed", label: "Executed" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;

const blank = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : (s as any);
};

async function audit(context: any, row: Record<string, unknown>) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: context.userId,
    area: "engagements",
    source: "portal",
    ...row,
  });
}

async function assertClientAccess(context: any, clientId: string) {
  const who = await whoIsStaff(context);
  if (who.isStaff) return who;
  const { data: member } = await context.supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", context.userId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!member) throw new Error("Forbidden: you don't have access to this organisation.");
  return who;
}

async function currentPricingVersion(context: any) {
  const { data } = await context.supabase
    .from("pricing_versions")
    .select("id, label")
    .eq("status", "published")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: (data as any).id as string, label: (data as any).label as string } : null;
}

const mapEngagementService = (s: any) => ({
  id: s.id as string,
  serviceId: (s.service_id as string) ?? null,
  serviceKey: s.service_key as string,
  serviceName: s.service_name as string,
  category: (s.category as string) ?? null,
  standardPriceCents: Number(s.standard_price_cents ?? 0),
  agreedPriceCents: Number(s.agreed_price_cents ?? 0),
  discountCents: Number(s.discount_cents ?? 0),
  discountReason: (s.discount_reason as string) ?? null,
  pricingModel: s.pricing_model as string,
  billingFrequency: s.billing_frequency as string,
  passThrough: Boolean(s.pass_through),
  effectiveDate: (s.effective_date as string) ?? null,
  endDate: (s.end_date as string) ?? null,
  pricingVersionLabel: (s.pricing_version_label as string) ?? null,
  scope: (s.scope as string) ?? null,
  deliverables: (s.deliverables ?? []) as string[],
  exclusions: (s.exclusions ?? []) as string[],
  renewalRule: (s.renewal_rule as string) ?? null,
  status: s.status as string,
  locked: Boolean(s.locked_at),
});

/** Everything that hangs off one engagement's services: lines, change orders, workflows. */
export const getEngagementServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ engagementId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: engagement, error } = await context.supabase
      .from("client_engagements")
      .select("*")
      .eq("id", data.engagementId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!engagement) throw new Error("Engagement not found.");
    const g = engagement as any;
    const who = await assertClientAccess(context, g.client_id);

    const [servicesRes, ordersRes, linesRes, workflowsRes, entitiesRes] = await Promise.all([
      context.supabase
        .from("engagement_services")
        .select("*")
        .eq("engagement_id", g.id)
        .order("created_at"),
      context.supabase
        .from("engagement_change_orders")
        .select("*")
        .eq("engagement_id", g.id)
        .order("change_no", { ascending: false }),
      context.supabase.from("change_order_lines").select("*"),
      context.supabase
        .from("engagement_workflows")
        .select("*")
        .eq("engagement_id", g.id)
        .order("created_at"),
      context.supabase
        .from("engagement_entities")
        .select("entity_id, client_entities(id, legal_name, entity_type)")
        .eq("engagement_id", g.id),
    ]);

    const lines = (linesRes.data ?? []) as any[];
    const services = ((servicesRes.data ?? []) as any[]).map(mapEngagementService);
    const active = services.filter((s) => s.status === "active" || s.status === "proposed");

    const annualCents = active
      .filter((s) => s.billingFrequency === "annual" || s.pricingModel === "annual")
      .reduce((sum, s) => sum + s.agreedPriceCents, 0);
    const oneTimeCents = active
      .filter((s) => s.billingFrequency === "one_time" && s.pricingModel !== "annual")
      .reduce((sum, s) => sum + s.agreedPriceCents, 0);

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      engagement: {
        id: g.id as string,
        clientId: g.client_id as string,
        title: g.title as string,
        deliveryStatus: g.delivery_status as string,
        effectiveDate: (g.effective_date as string) ?? null,
        billingFrequency: g.billing_frequency as string,
        serviceTerms: (g.service_terms as string) ?? null,
      },
      entities: ((entitiesRes.data ?? []) as any[]).map((r) => ({
        id: r.client_entities?.id as string,
        legalName: r.client_entities?.legal_name as string,
        entityType: r.client_entities?.entity_type as string,
      })),
      services,
      totals: { annualCents, oneTimeCents },
      changeOrders: ((ordersRes.data ?? []) as any[]).map((c) => ({
        id: c.id as string,
        changeNo: Number(c.change_no ?? 1),
        changeType: c.change_type as string,
        documentType: c.document_type as string,
        title: c.title as string,
        summary: (c.summary as string) ?? null,
        clientReason: (c.client_reason as string) ?? null,
        status: c.status as string,
        effectiveDate: (c.effective_date as string) ?? null,
        decisionNote: (c.decision_note as string) ?? null,
        clientSignerName: (c.client_signer_name as string) ?? null,
        clientSignedAt: (c.client_signed_at as string) ?? null,
        harmoniousSignerName: (c.harmonious_signer_name as string) ?? null,
        executedAt: (c.executed_at as string) ?? null,
        lines: lines
          .filter((l) => l.change_order_id === c.id)
          .map((l) => ({
            id: l.id as string,
            action: l.action as string,
            serviceName: l.service_name as string,
            serviceKey: l.service_key as string,
            standardPriceCents: Number(l.standard_price_cents ?? 0),
            agreedPriceCents: Number(l.agreed_price_cents ?? 0),
            pricingModel: l.pricing_model as string,
            billingFrequency: l.billing_frequency as string,
            effectiveDate: (l.effective_date as string) ?? null,
            scope: (l.scope as string) ?? null,
            note: (l.note as string) ?? null,
          })),
      })),
      workflows: ((workflowsRes.data ?? []) as any[]).map((w) => ({
        id: w.id as string,
        workflowKey: w.workflow_key as string,
        workflowName: w.workflow_name as string,
        targetPath: (w.target_path as string) ?? null,
        status: w.status as string,
        startedAt: (w.started_at as string) ?? null,
        completedAt: (w.completed_at as string) ?? null,
      })),
    };
  });

/** Staff put catalogue services onto an engagement, snapshotting today's pricing. */
export const addServicesToEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        engagementId: z.string().uuid(),
        serviceIds: z.array(z.string().uuid()).min(1),
        effectiveDate: z.string().optional().nullable(),
        overrides: z
          .array(
            z.object({
              serviceId: z.string().uuid(),
              agreedPriceCents: z.number().int().min(0),
              reason: z.string().optional().nullable(),
            }),
          )
          .default([]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIsStaff(context);
    if (!who.canManage) {
      throw new Error(
        "Forbidden: adding services to an engagement needs legal, compliance, finance, client success or admin authority.",
      );
    }

    const { data: engagement } = await context.supabase
      .from("client_engagements")
      .select("id, client_id")
      .eq("id", data.engagementId)
      .maybeSingle();
    if (!engagement) throw new Error("Engagement not found.");

    const { data: catalogue } = await context.supabase
      .from("service_catalog")
      .select("*")
      .in("id", data.serviceIds);
    const version = await currentPricingVersion(context);

    const rows = ((catalogue ?? []) as any[]).map((s) => {
      const override = data.overrides.find((o) => o.serviceId === s.id);
      const standard = Number(s.standard_price_cents ?? 0);
      const agreed = override ? override.agreedPriceCents : standard;
      if (override && override.agreedPriceCents !== standard && !override.reason?.trim()) {
        throw new Error(`Give a reason for the non-standard price on ${s.name}.`);
      }
      return {
        engagement_id: data.engagementId,
        client_id: (engagement as any).client_id,
        service_id: s.id,
        service_key: s.key,
        service_name: s.name,
        category: s.category,
        standard_price_cents: standard,
        agreed_price_cents: agreed,
        discount_cents: Math.max(0, standard - agreed),
        discount_reason: override?.reason ? override.reason.trim() : null,
        pricing_model: s.default_pricing_model ?? "one_time",
        billing_frequency: s.billing_frequency ?? "one_time",
        pass_through: (s.default_pricing_model ?? "") === "pass_through",
        effective_date: blank(data.effectiveDate),
        pricing_version_id: version?.id ?? null,
        pricing_version_label: version?.label ?? null,
        scope: s.standard_scope,
        deliverables: s.standard_deliverables ?? [],
        exclusions: s.standard_exclusions ?? [],
        renewal_rule: s.renewal_rule,
        status: "proposed",
        created_by: context.userId,
      };
    });

    const { error } = await context.supabase.from("engagement_services").insert(rows);
    if (error) throw new Error(error.message);

    await audit(context, {
      client_id: (engagement as any).client_id,
      action: "engagement_services_added",
      target: data.engagementId,
      new_value: { services: rows.map((r) => r.service_key) } as any,
    });

    return { added: rows.length };
  });

/**
 * Locks the engagement's proposed services to their executed commercial terms and
 * starts whatever delivery workflows the catalogue says each service launches.
 */
export const executeEngagementServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ engagementId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const who = await whoIsStaff(context);
    if (!who.canManage) throw new Error("Forbidden: executing an engagement needs contract authority.");

    const { data: engagement } = await context.supabase
      .from("client_engagements")
      .select("id, client_id, entity_id")
      .eq("id", data.engagementId)
      .maybeSingle();
    if (!engagement) throw new Error("Engagement not found.");
    const g = engagement as any;

    const { data: services } = await context.supabase
      .from("engagement_services")
      .select("*")
      .eq("engagement_id", g.id)
      .eq("status", "proposed");

    const now = new Date().toISOString();
    const pending = (services ?? []) as any[];
    if (pending.length > 0) {
      const { error } = await context.supabase
        .from("engagement_services")
        .update({ status: "active", locked_at: now })
        .eq("engagement_id", g.id)
        .eq("status", "proposed");
      if (error) throw new Error(error.message);
    }

    await instantiateWorkflows(context, g, pending);

    await context.supabase
      .from("client_engagements")
      .update({ delivery_status: "live" })
      .eq("id", g.id);

    await audit(context, {
      client_id: g.client_id,
      action: "engagement_executed",
      target: g.id,
      new_value: { locked: pending.length } as any,
    });

    return { locked: pending.length };
  });

async function instantiateWorkflows(context: any, engagement: any, services: any[]) {
  if (services.length === 0) return;
  const { data: catalogue } = await context.supabase
    .from("service_catalog")
    .select("id, name, onboarding_workflow, delivery_workflow")
    .in(
      "id",
      services.map((s) => s.service_id).filter(Boolean),
    );

  const rows: any[] = [];
  for (const s of services) {
    const entry = ((catalogue ?? []) as any[]).find((c) => c.id === s.service_id);
    const keys = [entry?.onboarding_workflow, entry?.delivery_workflow].filter(
      (k) => k && k !== "none",
    ) as string[];
    for (const key of Array.from(new Set(keys))) {
      rows.push({
        engagement_id: engagement.id,
        engagement_service_id: s.id,
        client_id: engagement.client_id,
        entity_id: engagement.entity_id ?? null,
        workflow_key: key,
        workflow_name: `${s.service_name}`,
        target_path: workflowPath(key),
        status: "not_started",
      });
    }
  }
  if (rows.length > 0) {
    await context.supabase.from("engagement_workflows").upsert(rows, {
      onConflict: "engagement_id,workflow_key,engagement_service_id",
      ignoreDuplicates: true,
    });
  }
}

/** A client asks to add, cancel or change a service. Nothing executed is touched. */
export const requestServiceChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        engagementId: z.string().uuid(),
        changeType: z.enum(["service_addition", "service_removal", "scope_change", "commercial_change"]),
        serviceIds: z.array(z.string().uuid()).default([]),
        engagementServiceIds: z.array(z.string().uuid()).default([]),
        reason: z.string().min(3),
        effectiveDate: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { data: engagement } = await context.supabase
      .from("client_engagements")
      .select("id, client_id, title")
      .eq("id", data.engagementId)
      .maybeSingle();
    if (!engagement) throw new Error("Engagement not found.");
    const g = engagement as any;
    await assertClientAccess(context, g.client_id);

    const { data: existing } = await context.supabase
      .from("engagement_change_orders")
      .select("change_no")
      .eq("engagement_id", g.id)
      .order("change_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const changeNo = Number((existing as any)?.change_no ?? 0) + 1;

    const titles: Record<string, string> = {
      service_addition: "Service addition",
      service_removal: "Service cancellation",
      scope_change: "Scope change",
      commercial_change: "Commercial change",
    };

    const { data: created, error } = await context.supabase
      .from("engagement_change_orders")
      .insert({
        engagement_id: g.id,
        client_id: g.client_id,
        change_no: changeNo,
        document_type: data.changeType === "commercial_change" ? "amendment" : "change_order",
        change_type: data.changeType,
        title: `${titles[data.changeType]} #${changeNo} — ${g.title}`,
        client_reason: data.reason.trim(),
        status: "requested",
        effective_date: blank(data.effectiveDate),
        requested_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const changeOrderId = (created as any).id as string;

    const lines: any[] = [];
    if (data.serviceIds.length > 0) {
      const { data: catalogue } = await context.supabase
        .from("service_catalog")
        .select("*")
        .in("id", data.serviceIds);
      for (const s of (catalogue ?? []) as any[]) {
        lines.push({
          change_order_id: changeOrderId,
          action: "add",
          service_id: s.id,
          service_key: s.key,
          service_name: s.name,
          standard_price_cents: Number(s.standard_price_cents ?? 0),
          agreed_price_cents: Number(s.standard_price_cents ?? 0),
          pricing_model: s.default_pricing_model ?? "one_time",
          billing_frequency: s.billing_frequency ?? "one_time",
          pass_through: (s.default_pricing_model ?? "") === "pass_through",
          effective_date: blank(data.effectiveDate),
          scope: s.standard_scope,
        });
      }
    }
    if (data.engagementServiceIds.length > 0) {
      const { data: current } = await context.supabase
        .from("engagement_services")
        .select("*")
        .in("id", data.engagementServiceIds);
      for (const s of (current ?? []) as any[]) {
        lines.push({
          change_order_id: changeOrderId,
          action: data.changeType === "service_removal" ? "remove" : "change",
          service_id: s.service_id,
          engagement_service_id: s.id,
          service_key: s.service_key,
          service_name: s.service_name,
          standard_price_cents: Number(s.standard_price_cents ?? 0),
          agreed_price_cents: Number(s.agreed_price_cents ?? 0),
          pricing_model: s.pricing_model,
          billing_frequency: s.billing_frequency,
          effective_date: blank(data.effectiveDate),
          scope: s.scope,
        });
      }
    }
    if (lines.length > 0) {
      await context.supabase.from("change_order_lines").insert(lines);
    }

    await audit(context, {
      client_id: g.client_id,
      action: "change_order_requested",
      target: changeOrderId,
      new_value: { changeType: data.changeType, lines: lines.length } as any,
    });

    return { id: changeOrderId, changeNo };
  });

/** Harmonious quotes, declines or withdraws a change order. */
export const decideChangeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        changeOrderId: z.string().uuid(),
        decision: z.enum(["quoted", "declined", "withdrawn"]),
        note: z.string().optional().nullable(),
        effectiveDate: z.string().optional().nullable(),
        lines: z
          .array(z.object({ id: z.string().uuid(), agreedPriceCents: z.number().int().min(0) }))
          .default([]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIsStaff(context);
    if (!who.canManage) throw new Error("Forbidden: deciding a change order needs contract authority.");

    for (const line of data.lines) {
      await context.supabase
        .from("change_order_lines")
        .update({ agreed_price_cents: line.agreedPriceCents })
        .eq("id", line.id)
        .eq("change_order_id", data.changeOrderId);
    }

    const { data: updated, error } = await context.supabase
      .from("engagement_change_orders")
      .update({
        status: data.decision,
        decision_note: blank(data.note),
        effective_date: blank(data.effectiveDate),
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.changeOrderId)
      .select("client_id")
      .single();
    if (error) throw new Error(error.message);

    await audit(context, {
      client_id: (updated as any).client_id,
      action: `change_order_${data.decision}`,
      target: data.changeOrderId,
      new_value: { note: data.note ?? null } as any,
    });

    return { ok: true };
  });

/** The client accepts a quoted change order by typing their legal name. */
export const signChangeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        changeOrderId: z.string().uuid(),
        signerName: z.string().min(2),
        signerTitle: z.string().optional().nullable(),
        confirmedServices: z.boolean(),
        confirmedChanges: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    if (!data.confirmedServices || !data.confirmedChanges) {
      throw new Error("Tick both confirmations before signing.");
    }

    const { data: order } = await context.supabase
      .from("engagement_change_orders")
      .select("id, client_id, status")
      .eq("id", data.changeOrderId)
      .maybeSingle();
    if (!order) throw new Error("Change order not found.");
    const o = order as any;
    await assertClientAccess(context, o.client_id);
    if (o.status !== "quoted") {
      throw new Error("Only a quoted change order can be signed.");
    }

    const { error } = await context.supabase
      .from("engagement_change_orders")
      .update({
        status: "client_signed",
        client_signed_by: context.userId,
        client_signer_name: data.signerName.trim(),
        client_signer_title: blank(data.signerTitle),
        client_signed_at: new Date().toISOString(),
      })
      .eq("id", o.id)
      .eq("status", "quoted");
    if (error) throw new Error(error.message);

    await audit(context, {
      client_id: o.client_id,
      action: "change_order_client_signed",
      target: o.id,
      new_value: { signer: data.signerName.trim() } as any,
    });

    return { ok: true };
  });

/** Harmonious countersigns; the change order takes effect and workflows start. */
export const executeChangeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        changeOrderId: z.string().uuid(),
        signerName: z.string().min(2),
        signerTitle: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIsStaff(context);
    if (!who.canManage) throw new Error("Forbidden: countersigning needs contract authority.");

    const { data: order } = await context.supabase
      .from("engagement_change_orders")
      .select("*")
      .eq("id", data.changeOrderId)
      .maybeSingle();
    if (!order) throw new Error("Change order not found.");
    const o = order as any;
    if (o.status !== "client_signed") {
      throw new Error("The client has to sign before Harmonious countersigns.");
    }

    const { data: engagement } = await context.supabase
      .from("client_engagements")
      .select("id, client_id, entity_id")
      .eq("id", o.engagement_id)
      .maybeSingle();
    const g = engagement as any;

    const { data: lines } = await context.supabase
      .from("change_order_lines")
      .select("*")
      .eq("change_order_id", o.id);

    const now = new Date().toISOString();
    const version = await currentPricingVersion(context);
    const added: any[] = [];

    for (const l of (lines ?? []) as any[]) {
      if (l.action === "add") {
        const { data: inserted } = await context.supabase
          .from("engagement_services")
          .insert({
            engagement_id: o.engagement_id,
            client_id: o.client_id,
            service_id: l.service_id,
            service_key: l.service_key,
            service_name: l.service_name,
            standard_price_cents: Number(l.standard_price_cents ?? 0),
            agreed_price_cents: Number(l.agreed_price_cents ?? 0),
            discount_cents: Math.max(
              0,
              Number(l.standard_price_cents ?? 0) - Number(l.agreed_price_cents ?? 0),
            ),
            pricing_model: l.pricing_model,
            billing_frequency: l.billing_frequency,
            pass_through: Boolean(l.pass_through),
            effective_date: l.effective_date ?? o.effective_date,
            pricing_version_id: version?.id ?? null,
            pricing_version_label: version?.label ?? null,
            scope: l.scope,
            status: "active",
            added_by_change_order_id: o.id,
            locked_at: now,
            created_by: context.userId,
          })
          .select("*")
          .single();
        if (inserted) added.push(inserted);
      } else if (l.action === "remove" && l.engagement_service_id) {
        await context.supabase
          .from("engagement_services")
          .update({
            status: "removed",
            end_date: (l.effective_date ?? o.effective_date) as string,
            removed_by_change_order_id: o.id,
          })
          .eq("id", l.engagement_service_id);
      } else if (l.engagement_service_id) {
        await context.supabase
          .from("engagement_services")
          .update({ scope: l.scope })
          .eq("id", l.engagement_service_id);
      }
    }

    if (g) await instantiateWorkflows(context, g, added);

    const { error } = await context.supabase
      .from("engagement_change_orders")
      .update({
        status: "executed",
        harmonious_signer_name: data.signerName.trim(),
        harmonious_signer_title: blank(data.signerTitle),
        harmonious_signed_at: now,
        executed_at: now,
      })
      .eq("id", o.id)
      .eq("status", "client_signed");
    if (error) throw new Error(error.message);

    await audit(context, {
      client_id: o.client_id,
      action: "change_order_executed",
      target: o.id,
      new_value: { added: added.length } as any,
    });

    return { ok: true, added: added.length };
  });
