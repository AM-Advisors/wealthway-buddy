import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

export const ENTITY_TYPES = [
  { value: "company", label: "Company" },
  { value: "fund", label: "Fund" },
  { value: "spv", label: "SPV" },
  { value: "series", label: "Series" },
  { value: "gp", label: "GP" },
  { value: "management_company", label: "Management company" },
  { value: "issuer", label: "Issuer" },
  { value: "investment_vehicle", label: "Investment vehicle" },
  { value: "other", label: "Other entity" },
] as const;

export const ENTITY_TYPE_VALUES = [
  "company",
  "fund",
  "spv",
  "series",
  "gp",
  "management_company",
  "issuer",
  "investment_vehicle",
  "other",
] as const;

export const ENTITY_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "forming", label: "Forming" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
] as const;

export const TAX_ID_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "applied", label: "Applied for" },
  { value: "issued", label: "Issued" },
  { value: "not_required", label: "Not required" },
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

async function requireStaff(context: any) {
  const who = await whoIs(context);
  if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");
  return who;
}

async function requireAuthority(context: any) {
  const who = await whoIs(context);
  if (!who.canManage) {
    throw new Error(
      "Forbidden: changing entities needs legal, compliance, finance, client success or admin authority.",
    );
  }
  return who;
}

async function audit(context: any, row: Record<string, unknown>) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: context.userId,
    area: "entities",
    source: "portal",
    ...row,
  });
}

const entityInput = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  entityType: z.enum(ENTITY_TYPE_VALUES),
  legalName: z.string().min(2),
  shortName: z.string().optional().nullable(),
  jurisdiction: z.string().optional().nullable(),
  formationDate: z.string().optional().nullable(),
  taxIdStatus: z.enum(["not_started", "applied", "issued", "not_required"]).default("not_started"),
  taxIdMasked: z.string().optional().nullable(),
  parentEntityId: z.string().uuid().optional().nullable(),
  offeringId: z.string().uuid().optional().nullable(),
  status: z.enum(["planned", "forming", "active", "closed"]).default("planned"),
  notes: z.string().optional().nullable(),
});

const blank = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : (s as any);
};

/** Every entity for one client, with its engagements counted. */
export const listClientEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ clientId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    if (!who.isStaff) {
      const { data: member } = await context.supabase
        .from("client_users")
        .select("client_id")
        .eq("user_id", context.userId)
        .eq("client_id", data.clientId)
        .maybeSingle();
      if (!member) throw new Error("Forbidden: you don't have access to this client.");
    }

    const [entitiesRes, engagementsRes, clientRes] = await Promise.all([
      context.supabase
        .from("client_entities")
        .select("*")
        .eq("client_id", data.clientId)
        .order("entity_type")
        .order("legal_name"),
      context.supabase
        .from("client_engagements")
        .select("id, entity_id, title, delivery_status, billing_frequency, effective_date, sow_id")
        .eq("client_id", data.clientId),
      context.supabase
        .from("clients")
        .select(
          "id, name, legal_name, status, msa_version, msa_signed_on, default_billing_frequency, payment_terms_days, default_discount_kind, default_discount_value, billing_contact_name, billing_contact_email",
        )
        .eq("id", data.clientId)
        .maybeSingle(),
    ]);
    if (entitiesRes.error) throw new Error(entitiesRes.error.message);
    if (engagementsRes.error) throw new Error(engagementsRes.error.message);

    const engagements = (engagementsRes.data ?? []) as any[];

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      client: clientRes.data
        ? {
            id: (clientRes.data as any).id as string,
            name: ((clientRes.data as any).legal_name ??
              (clientRes.data as any).name) as string,
            status: (clientRes.data as any).status as string,
            msaVersion: ((clientRes.data as any).msa_version as string) ?? null,
            msaSignedOn: ((clientRes.data as any).msa_signed_on as string) ?? null,
            defaultBillingFrequency: (clientRes.data as any).default_billing_frequency as string,
            paymentTermsDays: Number((clientRes.data as any).payment_terms_days ?? 30),
            defaultDiscountKind: ((clientRes.data as any).default_discount_kind as string) ?? null,
            defaultDiscountValue:
              (clientRes.data as any).default_discount_value === null ||
              (clientRes.data as any).default_discount_value === undefined
                ? null
                : Number((clientRes.data as any).default_discount_value),
            billingContactName: ((clientRes.data as any).billing_contact_name as string) ?? null,
            billingContactEmail: ((clientRes.data as any).billing_contact_email as string) ?? null,
          }
        : null,
      entities: ((entitiesRes.data ?? []) as any[]).map((e) => ({
        id: e.id as string,
        entityType: e.entity_type as string,
        legalName: e.legal_name as string,
        shortName: (e.short_name as string) ?? null,
        jurisdiction: (e.jurisdiction as string) ?? null,
        formationDate: (e.formation_date as string) ?? null,
        taxIdStatus: e.tax_id_status as string,
        taxIdMasked: (e.tax_id_masked as string) ?? null,
        parentEntityId: (e.parent_entity_id as string) ?? null,
        offeringId: (e.offering_id as string) ?? null,
        status: e.status as string,
        notes: (e.notes as string) ?? null,
        engagements: engagements
          .filter((g) => g.entity_id === e.id)
          .map((g) => ({
            id: g.id as string,
            title: g.title as string,
            deliveryStatus: g.delivery_status as string,
            billingFrequency: g.billing_frequency as string,
            effectiveDate: (g.effective_date as string) ?? null,
            sowId: (g.sow_id as string) ?? null,
          })),
      })),
      clientWideEngagements: engagements
        .filter((g) => !g.entity_id)
        .map((g) => ({
          id: g.id as string,
          title: g.title as string,
          deliveryStatus: g.delivery_status as string,
          billingFrequency: g.billing_frequency as string,
          effectiveDate: (g.effective_date as string) ?? null,
          sowId: (g.sow_id as string) ?? null,
        })),
    };
  });

/** Create or update one entity. */
export const saveEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => entityInput.parse(data))
  .handler(async ({ context, data }) => {
    await requireAuthority(context);

    if (data.parentEntityId && data.parentEntityId === data.id) {
      throw new Error("An entity can't be its own parent.");
    }

    const row = {
      client_id: data.clientId,
      entity_type: data.entityType,
      legal_name: data.legalName.trim(),
      short_name: blank(data.shortName),
      jurisdiction: blank(data.jurisdiction),
      formation_date: blank(data.formationDate),
      tax_id_status: data.taxIdStatus,
      tax_id_masked: blank(data.taxIdMasked),
      parent_entity_id: blank(data.parentEntityId),
      offering_id: blank(data.offeringId),
      status: data.status,
      notes: blank(data.notes),
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("client_entities")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context, {
        client_id: data.clientId,
        action: "entity_updated",
        target: data.id,
        new_value: row as any,
      });
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("client_entities")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, {
      client_id: data.clientId,
      action: "entity_created",
      target: (created as any).id,
      new_value: row as any,
    });
    return { id: (created as any).id as string };
  });

/** One entity with its parent, children, engagements and linked fund. */
export const getEntity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ entityId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);

    const { data: entity, error } = await context.supabase
      .from("client_entities")
      .select("*")
      .eq("id", data.entityId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!entity) throw new Error("Entity not found.");

    const e = entity as any;

    if (!who.isStaff) {
      const { data: member } = await context.supabase
        .from("client_users")
        .select("client_id")
        .eq("user_id", context.userId)
        .eq("client_id", e.client_id)
        .maybeSingle();
      if (!member) throw new Error("Forbidden: you don't have access to this entity.");
    }

    const [clientRes, parentRes, childrenRes, engagementsRes, offeringRes] = await Promise.all([
      context.supabase
        .from("clients")
        .select("id, name, legal_name")
        .eq("id", e.client_id)
        .maybeSingle(),
      e.parent_entity_id
        ? context.supabase
            .from("client_entities")
            .select("id, legal_name, entity_type")
            .eq("id", e.parent_entity_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
      context.supabase
        .from("client_entities")
        .select("id, legal_name, entity_type, status")
        .eq("parent_entity_id", e.id)
        .order("legal_name"),
      context.supabase
        .from("client_engagements")
        .select("id, title, delivery_status, billing_frequency, effective_date, sow_id")
        .eq("entity_id", e.id)
        .order("created_at", { ascending: false }),
      e.offering_id
        ? context.supabase
            .from("offerings")
            .select("id, name, slug, is_open")
            .eq("id", e.offering_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      client: clientRes.data
        ? {
            id: (clientRes.data as any).id as string,
            name: ((clientRes.data as any).legal_name ?? (clientRes.data as any).name) as string,
          }
        : null,
      entity: {
        id: e.id as string,
        clientId: e.client_id as string,
        entityType: e.entity_type as string,
        legalName: e.legal_name as string,
        shortName: (e.short_name as string) ?? null,
        jurisdiction: (e.jurisdiction as string) ?? null,
        formationDate: (e.formation_date as string) ?? null,
        taxIdStatus: e.tax_id_status as string,
        taxIdMasked: (e.tax_id_masked as string) ?? null,
        parentEntityId: (e.parent_entity_id as string) ?? null,
        offeringId: (e.offering_id as string) ?? null,
        status: e.status as string,
        notes: (e.notes as string) ?? null,
      },
      parent: parentRes?.data
        ? {
            id: (parentRes.data as any).id as string,
            legalName: (parentRes.data as any).legal_name as string,
            entityType: (parentRes.data as any).entity_type as string,
          }
        : null,
      children: ((childrenRes.data ?? []) as any[]).map((c) => ({
        id: c.id as string,
        legalName: c.legal_name as string,
        entityType: c.entity_type as string,
        status: c.status as string,
      })),
      engagements: ((engagementsRes.data ?? []) as any[]).map((g) => ({
        id: g.id as string,
        title: g.title as string,
        deliveryStatus: g.delivery_status as string,
        billingFrequency: g.billing_frequency as string,
        effectiveDate: (g.effective_date as string) ?? null,
        sowId: (g.sow_id as string) ?? null,
      })),
      offering: offeringRes?.data
        ? {
            id: (offeringRes.data as any).id as string,
            name: (offeringRes.data as any).name as string,
            slug: (offeringRes.data as any).slug as string,
            isOpen: Boolean((offeringRes.data as any).is_open),
          }
        : null,
    };
  });

/** Client-level terms that apply across every engagement. */
export const saveClientTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        defaultBillingFrequency: z.enum([
          "one_time",
          "monthly",
          "quarterly",
          "annual",
          "per_event",
        ]),
        paymentTermsDays: z.number().int().min(0).max(180),
        defaultDiscountKind: z.enum(["percent", "fixed"]).nullable().optional(),
        defaultDiscountValue: z.number().nullable().optional(),
        billingContactName: z.string().optional().nullable(),
        billingContactEmail: z.string().email().optional().nullable().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await requireAuthority(context);
    const row = {
      default_billing_frequency: data.defaultBillingFrequency,
      payment_terms_days: data.paymentTermsDays,
      default_discount_kind: data.defaultDiscountKind ?? null,
      default_discount_value: data.defaultDiscountValue ?? null,
      billing_contact_name: blank(data.billingContactName),
      billing_contact_email: blank(data.billingContactEmail),
    };
    const { error } = await context.supabase.from("clients").update(row).eq("id", data.clientId);
    if (error) throw new Error(error.message);
    await audit(context, {
      client_id: data.clientId,
      action: "client_terms_updated",
      target: data.clientId,
      new_value: row as any,
    });
    return { ok: true };
  });

/** Clients plus a count of entities and engagements, for the staff index. */
export const listEntityRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);

    const [clientsRes, entitiesRes, engagementsRes] = await Promise.all([
      context.supabase.from("clients").select("id, name, legal_name, status").order("legal_name"),
      context.supabase.from("client_entities").select("id, client_id, entity_type, status"),
      context.supabase.from("client_engagements").select("id, client_id, delivery_status"),
    ]);
    if (clientsRes.error) throw new Error(clientsRes.error.message);

    const entities = (entitiesRes.data ?? []) as any[];
    const engagements = (engagementsRes.data ?? []) as any[];

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      clients: ((clientsRes.data ?? []) as any[]).map((c) => ({
        id: c.id as string,
        name: (c.legal_name ?? c.name) as string,
        status: c.status as string,
        entityCount: entities.filter((e) => e.client_id === c.id).length,
        engagementCount: engagements.filter((g) => g.client_id === c.id).length,
        liveEngagements: engagements.filter(
          (g) => g.client_id === c.id && g.delivery_status === "live",
        ).length,
      })),
    };
  });
