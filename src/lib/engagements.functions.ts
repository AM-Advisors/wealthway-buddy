import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

export const BILLING_FREQUENCIES = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "per_event", label: "Per event" },
] as const;

export const DELIVERY_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "onboarding", label: "Onboarding" },
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
  { value: "closing", label: "Closing" },
  { value: "closed", label: "Closed" },
] as const;

async function whoIs(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    roles,
    isStaff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)),
    canManage: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
  };
}

async function requireAuthority(context: any) {
  const who = await whoIs(context);
  if (!who.canManage) {
    throw new Error(
      "Forbidden: changing engagement terms needs legal, compliance, finance, client success or admin authority.",
    );
  }
  return who;
}

async function audit(context: any, row: Record<string, unknown>) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: context.userId,
    area: "engagements",
    source: "portal",
    ...row,
  });
}

const blank = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : (s as any);
};

/** Everything behind one engagement: package, commercial terms, order, changes, signatures, delivery. */
export const getEngagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ engagementId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);

    const { data: row, error } = await context.supabase
      .from("client_engagements")
      .select("*")
      .eq("id", data.engagementId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Engagement not found.");
    const g = row as any;

    if (!who.isStaff) {
      const { data: member } = await context.supabase
        .from("client_users")
        .select("client_id")
        .eq("user_id", context.userId)
        .eq("client_id", g.client_id)
        .maybeSingle();
      if (!member) throw new Error("Forbidden: you don't have access to this engagement.");
    }

    const [clientRes, entityRes, sowRes, entitlementsRes] = await Promise.all([
      context.supabase
        .from("clients")
        .select("id, name, legal_name, payment_terms_days")
        .eq("id", g.client_id)
        .maybeSingle(),
      g.entity_id
        ? context.supabase
            .from("client_entities")
            .select("id, legal_name, entity_type, status, offering_id")
            .eq("id", g.entity_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
      g.sow_id
        ? context.supabase
            .from("client_sows")
            .select(
              "id, title, sow_type, status, stage, approval_status, effective_date, termination_date, notice_days, executed_at, locked, offering_id, sow_version",
            )
            .eq("id", g.sow_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
      context.supabase
        .from("service_entitlements")
        .select(
          "id, service_key, status, pricing_model, effective_date, harmonious_handles, client_handles, third_party_handles, note",
        )
        .eq("client_id", g.client_id)
        .order("service_key"),
    ]);

    const sow = sowRes?.data as any;
    const entity = entityRes?.data as any;

    const [sectionsRes, snapshotRes, changesRes, signaturesRes, amendmentsRes] = await Promise.all([
      sow
        ? context.supabase
            .from("sow_sections")
            .select("id, section_no, key, title, body, sort_order")
            .eq("sow_id", sow.id)
            .order("sort_order")
        : Promise.resolve({ data: [] } as any),
      sow
        ? context.supabase
            .from("sow_pricing_snapshots")
            .select("id, version_label, effective_date, locked")
            .eq("sow_id", sow.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
      sow
        ? context.supabase
            .from("agreement_change_requests")
            .select("id, section_title, requested_text, reason, status, created_at")
            .eq("sow_id", sow.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] } as any),
      sow
        ? context.supabase
            .from("agreement_signatures")
            .select("id, side, signer_name, signer_title, signed_at")
            .eq("sow_id", sow.id)
            .order("signed_at")
        : Promise.resolve({ data: [] } as any),
      sow
        ? context.supabase
            .from("sow_amendments")
            .select("id, amendment_no, title, status, effective_date, executed_at")
            .eq("sow_id", sow.id)
            .order("amendment_no")
        : Promise.resolve({ data: [] } as any),
    ]);

    const snapshot = snapshotRes?.data as any;
    const linesRes = snapshot
      ? await context.supabase
          .from("sow_pricing_lines")
          .select("id, label, service_key, pricing_model, standard_cents, final_cents, pass_through, included, unit, sort_order")
          .eq("snapshot_id", snapshot.id)
          .order("sort_order")
      : ({ data: [] } as any);

    const lines = ((linesRes.data ?? []) as any[]).map((l) => ({
      id: l.id as string,
      label: l.label as string,
      serviceKey: l.service_key as string,
      pricingModel: l.pricing_model as string,
      standardCents: Number(l.standard_cents ?? 0),
      finalCents: Number(l.final_cents ?? 0),
      passThrough: Boolean(l.pass_through),
      included: l.included !== false,
      unit: (l.unit as string) ?? null,
    }));

    const subtotalCents = lines
      .filter((l) => l.included && !l.passThrough)
      .reduce((sum, l) => sum + l.finalCents, 0);
    const discountKind = (g.discount_kind as string) ?? null;
    const discountValue =
      g.discount_value === null || g.discount_value === undefined ? null : Number(g.discount_value);
    const discountCents =
      discountKind === "percent" && discountValue
        ? Math.round((subtotalCents * discountValue) / 100)
        : discountKind === "fixed" && discountValue
          ? Math.round(discountValue * 100)
          : 0;

    // Delivery signals already tracked elsewhere for this engagement's entity/fund.
    const offeringId = (sow?.offering_id as string) ?? (entity?.offering_id as string) ?? null;
    const [complianceRes, holdsRes, documentsRes] = await Promise.all([
      offeringId
        ? context.supabase
            .from("fund_compliance_items")
            .select("id, label, status, due_date")
            .eq("offering_id", offeringId)
            .order("due_date", { nullsFirst: false })
        : Promise.resolve({ data: [] } as any),
      context.supabase
        .from("compliance_holds")
        .select("id, reason, status, created_at, offering_id")
        .eq("client_id", g.client_id)
        .eq("status", "open"),
      offeringId
        ? context.supabase
            .from("offering_documents")
            .select("id, title, doc_type, file_updated_at")
            .eq("offering_id", offeringId)
            .order("title")
        : Promise.resolve({ data: [] } as any),
    ]);

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      client: clientRes.data
        ? {
            id: (clientRes.data as any).id as string,
            name: ((clientRes.data as any).legal_name ?? (clientRes.data as any).name) as string,
            paymentTermsDays: Number((clientRes.data as any).payment_terms_days ?? 30),
          }
        : null,
      engagement: {
        id: g.id as string,
        clientId: g.client_id as string,
        entityId: (g.entity_id as string) ?? null,
        sowId: (g.sow_id as string) ?? null,
        title: g.title as string,
        billingFrequency: g.billing_frequency as string,
        discountKind,
        discountValue,
        discountReason: (g.discount_reason as string) ?? null,
        effectiveDate: (g.effective_date as string) ?? null,
        firstInvoiceDate: (g.first_invoice_date as string) ?? null,
        deliveryStatus: g.delivery_status as string,
        serviceTerms: (g.service_terms as string) ?? null,
        notes: (g.notes as string) ?? null,
      },
      entity: entity
        ? {
            id: entity.id as string,
            legalName: entity.legal_name as string,
            entityType: entity.entity_type as string,
            status: entity.status as string,
          }
        : null,
      sow: sow
        ? {
            id: sow.id as string,
            title: sow.title as string,
            sowType: sow.sow_type as string,
            status: sow.status as string,
            stage: (sow.stage as string) ?? "draft",
            approvalStatus: (sow.approval_status as string) ?? "pending",
            effectiveDate: (sow.effective_date as string) ?? null,
            terminationDate: (sow.termination_date as string) ?? null,
            noticeDays: sow.notice_days === null ? null : Number(sow.notice_days),
            executedAt: (sow.executed_at as string) ?? null,
            locked: Boolean(sow.locked),
            version: Number(sow.sow_version ?? 1),
          }
        : null,
      sections: ((sectionsRes.data ?? []) as any[]).map((s) => ({
        id: s.id as string,
        sectionNo: Number(s.section_no ?? 0),
        title: s.title as string,
        body: s.body as string,
      })),
      pricing: {
        versionLabel: (snapshot?.version_label as string) ?? null,
        locked: Boolean(snapshot?.locked),
        lines,
        subtotalCents,
        discountCents,
        totalCents: Math.max(subtotalCents - discountCents, 0),
      },
      entitlements: ((entitlementsRes.data ?? []) as any[]).map((e) => ({
        id: e.id as string,
        serviceKey: e.service_key as string,
        status: e.status as string,
        pricingModel: (e.pricing_model as string) ?? null,
        effectiveDate: (e.effective_date as string) ?? null,
        harmoniousHandles: (e.harmonious_handles as string) ?? null,
        clientHandles: (e.client_handles as string) ?? null,
        thirdPartyHandles: (e.third_party_handles as string) ?? null,
        note: (e.note as string) ?? null,
      })),
      changes: ((changesRes.data ?? []) as any[]).map((c) => ({
        id: c.id as string,
        sectionTitle: (c.section_title as string) ?? "Section",
        requestedText: (c.requested_text as string) ?? "",
        reason: (c.reason as string) ?? null,
        status: c.status as string,
        createdAt: c.created_at as string,
      })),
      amendments: ((amendmentsRes.data ?? []) as any[]).map((a) => ({
        id: a.id as string,
        amendmentNo: Number(a.amendment_no ?? 0),
        title: a.title as string,
        status: a.status as string,
        effectiveDate: (a.effective_date as string) ?? null,
        executedAt: (a.executed_at as string) ?? null,
      })),
      signatures: ((signaturesRes.data ?? []) as any[]).map((s) => ({
        id: s.id as string,
        side: s.side as string,
        name: (s.signer_name as string) ?? "",
        title: (s.signer_title as string) ?? null,
        signedAt: s.signed_at as string,
      })),
      delivery: {
        offeringId,
        compliance: ((complianceRes.data ?? []) as any[]).map((c) => ({
          id: c.id as string,
          title: c.label as string,
          status: c.status as string,
          dueDate: (c.due_date as string) ?? null,
        })),
        openHolds: ((holdsRes.data ?? []) as any[]).length,
        documents: ((documentsRes.data ?? []) as any[]).map((d) => ({
          id: d.id as string,
          title: d.title as string,
          status: (d.doc_type as string) ?? "document",
          updatedAt: (d.file_updated_at as string) ?? null,
        })),
      },
    };
  });

/** Create or update an engagement and its commercial terms. */
export const saveEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        clientId: z.string().uuid(),
        entityId: z.string().uuid().nullable().optional(),
        sowId: z.string().uuid().nullable().optional(),
        title: z.string().min(2),
        billingFrequency: z.enum(["one_time", "monthly", "quarterly", "annual", "per_event"]),
        discountKind: z.enum(["percent", "fixed"]).nullable().optional(),
        discountValue: z.number().nullable().optional(),
        discountReason: z.string().optional().nullable(),
        effectiveDate: z.string().optional().nullable(),
        firstInvoiceDate: z.string().optional().nullable(),
        deliveryStatus: z.enum([
          "not_started",
          "onboarding",
          "live",
          "paused",
          "closing",
          "closed",
        ]),
        serviceTerms: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await requireAuthority(context);

    if (data.discountKind && !data.discountValue) {
      throw new Error("Enter the discount amount.");
    }
    if (data.discountKind && !(data.discountReason ?? "").trim()) {
      throw new Error("A discount needs a written reason.");
    }

    const row = {
      client_id: data.clientId,
      entity_id: blank(data.entityId),
      sow_id: blank(data.sowId),
      title: data.title.trim(),
      billing_frequency: data.billingFrequency,
      discount_kind: data.discountKind ?? null,
      discount_value: data.discountValue ?? null,
      discount_reason: blank(data.discountReason),
      effective_date: blank(data.effectiveDate),
      first_invoice_date: blank(data.firstInvoiceDate),
      delivery_status: data.deliveryStatus,
      service_terms: blank(data.serviceTerms),
      notes: blank(data.notes),
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("client_engagements")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context, {
        client_id: data.clientId,
        action: "engagement_updated",
        target: data.id,
        new_value: row as any,
      });
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("client_engagements")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, {
      client_id: data.clientId,
      action: "engagement_created",
      target: (created as any).id,
      new_value: row as any,
    });
    return { id: (created as any).id as string };
  });

/** Statements of work for one client that aren't attached to an engagement yet. */
export const listLinkableSows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ clientId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");

    const [sowsRes, usedRes] = await Promise.all([
      context.supabase
        .from("client_sows")
        .select("id, title, status, stage, offering_id")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("client_engagements")
        .select("sow_id")
        .eq("client_id", data.clientId),
    ]);
    if (sowsRes.error) throw new Error(sowsRes.error.message);

    const used = new Set(
      ((usedRes.data ?? []) as any[]).map((r) => r.sow_id).filter(Boolean) as string[],
    );

    return ((sowsRes.data ?? []) as any[]).map((s) => ({
      id: s.id as string,
      title: s.title as string,
      status: s.status as string,
      stage: (s.stage as string) ?? "draft",
      linked: used.has(s.id as string),
    }));
  });
