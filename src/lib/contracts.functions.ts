import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
] as const;

/** Roles allowed to change contractual scope, pricing or entitlements.
 *  CEO/CRO carry the executive role. */
export const CONTRACT_ROLES = [
  "admin",
  "super_admin",
  "legal",
  "client_success",
  "compliance",
  "finance",
  "executive",
] as const;

export const SERVICE_CATEGORIES = [
  { key: "formation", label: "Fund & SPV formation" },
  { key: "onboarding", label: "Investor onboarding & compliance" },
  { key: "administration", label: "Fund administration" },
  { key: "banking", label: "Banking & payments" },
  { key: "filings", label: "Regulatory filings" },
  { key: "tax", label: "Tax coordination" },
  { key: "reporting", label: "Financial reporting" },
] as const;

export const ENTITLEMENT_STATUSES = [
  { value: "included", label: "Included" },
  { value: "optional", label: "Optional" },
  { value: "requested", label: "Pending approval" },
  { value: "not_included", label: "Not included" },
] as const;

export const PRICING_MODELS = [
  { value: "one_time", label: "One-time" },
  { value: "annual", label: "Annual" },
  { value: "recurring", label: "Recurring" },
  { value: "transaction", label: "Transaction-based" },
  { value: "pass_through", label: "Pass-through" },
] as const;

type Who = { userId: string; roles: string[]; isStaff: boolean; canManage: boolean; email: string };

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
    email: (context.claims?.email as string | undefined) ?? "",
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
      "Forbidden: changing contracted scope, pricing or entitlements needs legal, compliance, finance, client success or admin authority.",
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
    approval?: string | null;
    source?: string | null;
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
    approval: entry.approval ?? null,
    source: entry.source ?? "web",
  });
}

/* ------------------------------------------------------------------ access */

/** Tells the app which contract areas the signed-in person may see or change. */
export const getContractAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await whoIs(context);
    return { isStaff: who.isStaff, canManage: who.canManage, roles: who.roles };
  });

/* ----------------------------------------------------------------- clients */

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const [{ data: clients }, { data: funds }, { data: sows }] = await Promise.all([
      context.supabase.from("clients").select("*").order("name"),
      context.supabase.from("offerings").select("id, name, client_id, reg_type, is_open"),
      context.supabase.from("client_sows").select("id, client_id, title, status, sow_type"),
    ]);
    return {
      clients: (clients ?? []).map((c: any) => ({
        ...c,
        funds: (funds ?? []).filter((f: any) => f.client_id === c.id),
        sows: (sows ?? []).filter((s: any) => s.client_id === c.id),
      })),
      unassignedFunds: (funds ?? []).filter((f: any) => !f.client_id),
    };
  });

const clientInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  legal_name: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["active", "prospect", "terminated"]).default("active"),
  msa_signed_on: z.string().optional().or(z.literal("")),
  msa_version: z.string().trim().max(60).optional().or(z.literal("")),
  primary_contact_name: z.string().trim().max(160).optional().or(z.literal("")),
  primary_contact_email: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const saveClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientInput.parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const row = {
      name: data.name,
      legal_name: data.legal_name || null,
      status: data.status,
      msa_signed_on: data.msa_signed_on || null,
      msa_version: data.msa_version || null,
      primary_contact_name: data.primary_contact_name || null,
      primary_contact_email: data.primary_contact_email || null,
      notes: data.notes || null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("clients").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context, who, {
        area: "client",
        action: "updated",
        clientId: data.id,
        next: row,
      });
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("clients")
      .insert({ ...row, created_by: who.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "client",
      action: "created",
      clientId: created.id,
      next: row,
    });
    return { id: created.id as string };
  });

export const assignFundToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offeringId: z.string().uuid(), clientId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { error } = await context.supabase
      .from("offerings")
      .update({ client_id: data.clientId })
      .eq("id", data.offeringId);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "client",
      action: data.clientId ? "fund assigned" : "fund unassigned",
      clientId: data.clientId,
      offeringId: data.offeringId,
    });
    return { ok: true };
  });

/* -------------------------------------------------------------------- SOWs */

const sowInput = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid(),
  offering_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
  sow_type: z.enum(["spv", "fund", "administration", "other"]).default("spv"),
  status: z.enum(["draft", "active", "terminated"]).default("draft"),
  effective_date: z.string().optional().or(z.literal("")),
  termination_date: z.string().optional().or(z.literal("")),
  notice_days: z.number().int().min(0).max(365).default(60),
  signed_by: z.string().trim().max(160).optional().or(z.literal("")),
  signed_on: z.string().optional().or(z.literal("")),
  eligibility: z.record(z.string(), z.any()).default({}),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const saveSow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sowInput.parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const row = {
      client_id: data.client_id,
      offering_id: data.offering_id ?? null,
      title: data.title,
      sow_type: data.sow_type,
      status: data.status,
      effective_date: data.effective_date || null,
      termination_date: data.termination_date || null,
      notice_days: data.notice_days,
      signed_by: data.signed_by || null,
      signed_on: data.signed_on || null,
      eligibility: data.eligibility,
      notes: data.notes || null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("client_sows").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context, who, {
        area: "sow",
        action: "updated",
        clientId: data.client_id,
        target: data.id,
        next: row,
      });
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("client_sows")
      .insert({ ...row, created_by: who.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "sow",
      action: "created",
      clientId: data.client_id,
      target: created.id,
      next: row,
    });
    return { id: created.id as string };
  });

/* ------------------------------------------------------ catalog and scope */

export const getServiceCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("service_catalog")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { services: data ?? [] };
  });

/**
 * The scope picture for one client (and optionally one fund): every catalog
 * service with its entitlement status. Services with no entitlement row are
 * reported as "unset" so existing funds keep working until scope is recorded.
 */
export const getClientScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ clientId: z.string().uuid(), offeringId: z.string().uuid().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    const [{ data: client }, { data: catalog }, { data: rows }, { data: sows }, { data: pricing }] =
      await Promise.all([
        context.supabase.from("clients").select("*").eq("id", data.clientId).maybeSingle(),
        context.supabase.from("service_catalog").select("*").eq("active", true).order("sort_order"),
        context.supabase.from("service_entitlements").select("*").eq("client_id", data.clientId),
        context.supabase
          .from("client_sows")
          .select("*")
          .eq("client_id", data.clientId)
          .order("created_at"),
        context.supabase.from("client_pricing").select("*").eq("client_id", data.clientId),
      ]);

    if (!client) throw new Error("That client isn't available.");

    const relevant = (rows ?? []).filter(
      (r: any) => !r.offering_id || !data.offeringId || r.offering_id === data.offeringId,
    );

    const services = (catalog ?? []).map((s: any) => {
      const fundRow = relevant.find(
        (r: any) => r.service_key === s.key && r.offering_id === (data.offeringId ?? null),
      );
      const clientRow = relevant.find((r: any) => r.service_key === s.key && !r.offering_id);
      const row = fundRow ?? clientRow ?? null;
      return {
        key: s.key,
        name: s.name,
        category: s.category,
        description: s.description,
        material: s.material,
        status: row ? (row.status as string) : "unset",
        entitlementId: row?.id ?? null,
        sowId: row?.sow_id ?? null,
        scope: fundRow ? "fund" : clientRow ? "client" : "none",
        pricingModel: row?.pricing_model ?? s.default_pricing_model,
        effectiveDate: row?.effective_date ?? null,
        terminationDate: row?.termination_date ?? null,
        note: row?.note ?? null,
        harmoniousHandles: row?.harmonious_handles ?? s.harmonious_handles,
        clientHandles: row?.client_handles ?? s.client_handles,
        thirdPartyHandles: row?.third_party_handles ?? s.third_party_handles,
        requiredDocuments: row?.required_documents ?? s.required_documents ?? [],
        requiredApprovals: row?.required_approvals ?? s.required_approvals ?? [],
        requiredChecks: row?.required_checks ?? s.required_checks ?? [],
        thirdPartyDependency: row?.third_party_dependency ?? s.third_party_dependency,
      };
    });

    return {
      client,
      sows: sows ?? [],
      pricing: pricing ?? [],
      services,
      canManage: who.canManage,
      isStaff: who.isStaff,
    };
  });

/** The scope picture for one fund, resolved through the fund's client. */
export const getFundScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    const { data: fund, error } = await context.supabase
      .from("offerings")
      .select("id, name, client_id, reg_type")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fund) throw new Error("That fund isn't available.");
    if (!fund.client_id) {
      return {
        fund,
        client: null,
        configured: false,
        services: [] as any[],
        holds: [] as any[],
        canManage: who.canManage,
        isStaff: who.isStaff,
      };
    }

    const [{ data: catalog }, { data: rows }, { data: client }, { data: holds }] =
      await Promise.all([
        context.supabase.from("service_catalog").select("*").eq("active", true).order("sort_order"),
        context.supabase.from("service_entitlements").select("*").eq("client_id", fund.client_id),
        context.supabase.from("clients").select("*").eq("id", fund.client_id).maybeSingle(),
        context.supabase
          .from("compliance_holds")
          .select("*")
          .eq("status", "active")
          .or(`offering_id.eq.${fund.id},client_id.eq.${fund.client_id}`),
      ]);

    const relevant = (rows ?? []).filter(
      (r: any) => !r.offering_id || r.offering_id === fund.id,
    );

    const services = (catalog ?? []).map((s: any) => {
      const fundRow = relevant.find((r: any) => r.service_key === s.key && r.offering_id === fund.id);
      const clientRow = relevant.find((r: any) => r.service_key === s.key && !r.offering_id);
      const row = fundRow ?? clientRow ?? null;
      return {
        key: s.key,
        name: s.name,
        category: s.category,
        description: s.description,
        material: s.material,
        status: row ? (row.status as string) : "unset",
        harmoniousHandles: row?.harmonious_handles ?? s.harmonious_handles,
        clientHandles: row?.client_handles ?? s.client_handles,
        thirdPartyHandles: row?.third_party_handles ?? s.third_party_handles,
        thirdPartyDependency: row?.third_party_dependency ?? s.third_party_dependency,
        requiredDocuments: row?.required_documents ?? s.required_documents ?? [],
        requiredApprovals: row?.required_approvals ?? s.required_approvals ?? [],
        requiredChecks: row?.required_checks ?? s.required_checks ?? [],
        note: row?.note ?? null,
      };
    });

    return {
      fund,
      client: client ?? null,
      configured: (rows ?? []).length > 0,
      services,
      holds: holds ?? [],
      canManage: who.canManage,
      isStaff: who.isStaff,
    };
  });

const entitlementInput = z.object({
  client_id: z.string().uuid(),
  offering_id: z.string().uuid().nullable().optional(),
  sow_id: z.string().uuid().nullable().optional(),
  service_key: z.string().min(2),
  status: z.enum(["included", "optional", "requested", "not_included"]),
  pricing_model: z.string().max(40).optional().or(z.literal("")),
  effective_date: z.string().optional().or(z.literal("")),
  termination_date: z.string().optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const setEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entitlementInput.parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);

    const { data: service } = await context.supabase
      .from("service_catalog")
      .select("key, material, name")
      .eq("key", data.service_key)
      .maybeSingle();
    if (!service) throw new Error("Unknown service.");

    if (service.material && data.status === "included" && !data.sow_id) {
      throw new Error(
        `${service.name} is a material service. Attach the statement of work that includes it before switching it on.`,
      );
    }

    if (data.status === "included" && data.sow_id) {
      const { data: coverSow } = await context.supabase
        .from("client_sows")
        .select("title, approval_status")
        .eq("id", data.sow_id)
        .maybeSingle();
      if (((coverSow as any)?.approval_status as string) !== "approved") {
        throw new Error(
          `${(coverSow as any)?.title ?? "That statement of work"} is waiting for administrator approval. Services cannot be switched on under it yet.`,
        );
      }
    }

    const existingQuery = context.supabase
      .from("service_entitlements")
      .select("id, status")
      .eq("client_id", data.client_id)
      .eq("service_key", data.service_key);
    const { data: existing } = data.offering_id
      ? await existingQuery.eq("offering_id", data.offering_id).maybeSingle()
      : await existingQuery.is("offering_id", null).maybeSingle();


    const row = {
      client_id: data.client_id,
      offering_id: data.offering_id ?? null,
      sow_id: data.sow_id ?? null,
      service_key: data.service_key,
      status: data.status,
      pricing_model: data.pricing_model || null,
      effective_date: data.effective_date || null,
      termination_date: data.termination_date || null,
      note: data.note || null,
      approved_by: data.status === "included" ? who.userId : null,
      approved_at: data.status === "included" ? new Date().toISOString() : null,
    };

    if (existing) {
      const { error } = await context.supabase
        .from("service_entitlements")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("service_entitlements")
        .insert({ ...row, created_by: who.userId });
      if (error) throw new Error(error.message);
    }


    await audit(context, who, {
      area: "entitlement",
      action: `set ${data.status}`,
      clientId: data.client_id,
      offeringId: data.offering_id ?? null,
      target: data.service_key,
      previous: existing ? { status: existing.status } : null,
      next: { status: data.status, sow_id: data.sow_id ?? null },
      approval: data.sow_id ? `SOW ${data.sow_id}` : null,
    });
    return { ok: true };
  });

/* --------------------------------------------------------- change of scope */

export const requestService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        offeringId: z.string().uuid().nullable().optional(),
        serviceKey: z.string().min(2),
        note: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    const { data: created, error } = await context.supabase
      .from("service_requests")
      .insert({
        client_id: data.clientId,
        offering_id: data.offeringId ?? null,
        service_key: data.serviceKey,
        status: "requested",
        requested_by: who.userId,
        requester_note: data.note || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "service request",
      action: "submitted",
      clientId: data.clientId,
      offeringId: data.offeringId ?? null,
      target: data.serviceKey,
    });
    return { id: created.id as string };
  });

type RequestRow = Record<string, any>;

async function decorateRequests(context: any, requests: RequestRow[]) {
  const [{ data: clients }, { data: funds }, { data: catalog }, { data: sows }, { data: people }, { data: published }] =
    await Promise.all([
      context.supabase.from("clients").select("id, name"),
      context.supabase.from("offerings").select("id, name"),
      context.supabase.from("service_catalog").select("key, name, material, description, category"),
      context.supabase.from("client_sows").select("id, client_id, offering_id, title, status"),
      context.supabase.from("profiles").select("id, full_name, email"),
      context.supabase.from("pricing_versions").select("id").eq("status", "published").limit(1).maybeSingle(),
    ]);
  let rateCard: Record<string, { amount_cents: number | null; pricing_model: string | null }> = {};
  if (published) {
    const { data: items } = await context.supabase
      .from("pricing_items")
      .select("service_key, amount_cents, pricing_model")
      .eq("version_id", published.id)
      .not("service_key", "is", null);
    for (const i of items ?? []) {
      rateCard[(i as any).service_key] = {
        amount_cents: (i as any).amount_cents,
        pricing_model: (i as any).pricing_model,
      };
    }
  }
  return (requests ?? []).map((r: any) => ({
    ...r,
    clientName: (clients ?? []).find((c: any) => c.id === r.client_id)?.name ?? "Client",
    fundName: r.offering_id
      ? ((funds ?? []).find((f: any) => f.id === r.offering_id)?.name ?? "Fund")
      : null,
    serviceName: (catalog ?? []).find((c: any) => c.key === r.service_key)?.name ?? r.service_key,
    serviceDescription:
      (catalog ?? []).find((c: any) => c.key === r.service_key)?.description ?? null,
    material: (catalog ?? []).find((c: any) => c.key === r.service_key)?.material ?? false,
    requesterName:
      (people ?? []).find((p: any) => p.id === r.requested_by)?.full_name ??
      (people ?? []).find((p: any) => p.id === r.requested_by)?.email ??
      null,
    sowTitle: (sows ?? []).find((s: any) => s.id === (r as any).sow_id)?.title ?? null,
    suggested: rateCard[r.service_key] ?? null,
  }));
}

/** Staff queue of every change-of-scope request. */
export const listServiceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const { data: requests } = await context.supabase
      .from("service_requests")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: sows } = await context.supabase
      .from("client_sows")
      .select("id, client_id, offering_id, title, status")
      .order("created_at", { ascending: false });
    return {
      canManage: who.canManage,
      requests: await decorateRequests(context, (requests ?? []) as RequestRow[]),
      sows: sows ?? [],
    };
  });

/** The signed-in person's own client-side view of their requests. */
export const getMyServiceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await whoIs(context);
    const { data: requests } = await context.supabase
      .from("service_requests")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = await decorateRequests(context, (requests ?? []) as RequestRow[]);
    return { requests: rows };
  });

async function loadRequest(context: any, id: string) {
  const { data: request, error } = await context.supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) throw new Error("That request isn't available.");
  return request as any;
}

/** Staff: acknowledge the request and start scoping it. */
export const startServiceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().trim().max(2000).optional().or(z.literal("")) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const request = await loadRequest(context, data.id);
    if (request.status !== "requested") throw new Error("Only a new request can move into review.");
    const { error } = await context.supabase
      .from("service_requests")
      .update({ status: "in_review", reviewer_id: who.userId, review_note: data.note || null } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "service request",
      action: "in review",
      clientId: request.client_id,
      offeringId: request.offering_id,
      target: request.service_key,
      previous: { status: request.status },
      next: { status: "in_review" },
    });
    return { ok: true };
  });

/** Staff: propose the fee, basis, start date and amendment terms. */
export const quoteServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        feeCents: z.number().int().min(0).nullable().optional(),
        pricingModel: z.string().max(40).optional().or(z.literal("")),
        sowId: z.string().uuid().nullable().optional(),
        effectiveDate: z.string().optional().or(z.literal("")),
        amendmentTerms: z.string().trim().max(8000).optional().or(z.literal("")),
        amendmentPath: z.string().max(500).optional().or(z.literal("")),
        feeSource: z.enum(["client_rate", "standard", "custom"]).optional(),
        feeRateId: z.string().uuid().nullable().optional(),
        feeOverrideReason: z.string().trim().max(500).optional().or(z.literal("")),
        note: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const request = await loadRequest(context, data.id);
    if (!["requested", "in_review", "quoted"].includes(request.status)) {
      throw new Error("This request is no longer open for a quote.");
    }
    if (data.feeCents === null || data.feeCents === undefined) {
      throw new Error("Enter the proposed fee first.");
    }
    const feeSource = data.feeSource ?? "custom";
    if (feeSource === "custom" && !(data.feeOverrideReason && data.feeOverrideReason.length >= 3)) {
      throw new Error("Say why this quote uses a fee that isn't on the rate card.");
    }
    const { error } = await context.supabase
      .from("service_requests")
      .update({
        status: "quoted",
        reviewer_id: who.userId,
        review_note: data.note || null,
        proposed_fee_cents: data.feeCents,
        proposed_pricing_model: data.pricingModel || null,
        effective_date: data.effectiveDate || null,
        amendment_terms: data.amendmentTerms || null,
        amendment_path: data.amendmentPath || null,
        sow_id: data.sowId ?? request.sow_id ?? null,
        fee_source: feeSource,
        fee_rate_id: feeSource === "client_rate" ? (data.feeRateId ?? null) : null,
        fee_override_reason: feeSource === "custom" ? data.feeOverrideReason || null : null,
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "service request",
      action: "quoted",
      clientId: request.client_id,
      offeringId: request.offering_id,
      target: request.service_key,
      previous: { status: request.status },
      next: {
        status: "quoted",
        fee_cents: data.feeCents,
        pricing_model: data.pricingModel || null,
        effective_date: data.effectiveDate || null,
      },
    });
    return { ok: true };
  });

/** Staff: decline with a reason the client can read. */
export const declineServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(2).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const request = await loadRequest(context, data.id);
    if (["activated", "withdrawn"].includes(request.status)) {
      throw new Error("This request can no longer be declined.");
    }
    const { error } = await context.supabase
      .from("service_requests")
      .update({
        status: "declined",
        reviewer_id: who.userId,
        declined_reason: data.reason,
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "service request",
      action: "declined",
      clientId: request.client_id,
      offeringId: request.offering_id,
      target: request.service_key,
      previous: { status: request.status },
      next: { status: "declined", reason: data.reason },
    });
    return { ok: true };
  });

/** Staff: switch the service on after the client has signed. */
export const activateServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        sowId: z.string().uuid(),
        effectiveDate: z.string().optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const request = await loadRequest(context, data.id);
    if (request.status !== "signed") {
      throw new Error("The client needs to sign the amendment before this service can go live.");
    }
    const { data: coveringSow } = await context.supabase
      .from("client_sows")
      .select("title, approval_status")
      .eq("id", data.sowId)
      .maybeSingle();
    const coverApproval = ((coveringSow as any)?.approval_status as string) ?? "pending";
    if (coverApproval !== "approved") {
      throw new Error(
        `${(coveringSow as any)?.title ?? "That statement of work"} is not approved yet. An administrator has to approve it before services can be activated under it.`,
      );
    }

    const effectiveDate = data.effectiveDate || request.effective_date || new Date().toISOString().slice(0, 10);

    const scope = {
      client_id: request.client_id,
      offering_id: request.offering_id,
      sow_id: data.sowId,
      service_key: request.service_key,
      status: "included",
      effective_date: effectiveDate,
      approved_by: who.userId,
      approved_at: new Date().toISOString(),
      created_by: who.userId,
    };
    const existing = context.supabase
      .from("service_entitlements")
      .select("id")
      .eq("client_id", request.client_id)
      .eq("service_key", request.service_key);
    const { data: found } = request.offering_id
      ? await existing.eq("offering_id", request.offering_id).maybeSingle()
      : await existing.is("offering_id", null).maybeSingle();

    let entitlementId: string;
    if (found) {
      const { error } = await context.supabase
        .from("service_entitlements")
        .update(scope as any)
        .eq("id", found.id);
      if (error) throw new Error(error.message);
      entitlementId = found.id;
    } else {
      const { data: made, error } = await context.supabase
        .from("service_entitlements")
        .insert(scope as any)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      entitlementId = made.id;
    }

    // Record the agreed rate against the client so invoicing reads one place.
    const { data: catalogRow } = await context.supabase
      .from("service_catalog")
      .select("name")
      .eq("key", request.service_key)
      .maybeSingle();
    await context.supabase.from("client_pricing").insert({
      client_id: request.client_id,
      sow_id: data.sowId,
      service_key: request.service_key,
      label: catalogRow?.name ?? request.service_key,
      standard_cents: request.proposed_fee_cents,
      contracted_cents: request.proposed_fee_cents,
      pricing_model: request.proposed_pricing_model,
      effective_date: effectiveDate,
      approved_by: who.userId,
      approved_at: new Date().toISOString(),
      created_by: who.userId,
      notes: `Agreed through service request ${request.id}`,
    } as any);

    const { error } = await context.supabase
      .from("service_requests")
      .update({
        status: "activated",
        activated_entitlement_id: entitlementId,
        activated_at: new Date().toISOString(),
        activated_by: who.userId,
        effective_date: effectiveDate,
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      area: "service request",
      action: "activated",
      clientId: request.client_id,
      offeringId: request.offering_id,
      target: request.service_key,
      previous: { status: request.status },
      next: { status: "activated", entitlement_id: entitlementId, effective_date: effectiveDate },
      approval: `SOW ${data.sowId}`,
    });
    return { ok: true };
  });

/** Client: sign the quoted amendment. The guarded RPC does the checks. */
export const acceptServiceQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        signerName: z.string().trim().min(2).max(200),
        signerTitle: z.string().trim().max(200).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("accept_service_quote", {
      _request_id: data.requestId,
      _signer_name: data.signerName,
      ...(data.signerTitle ? { _signer_title: data.signerTitle } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Client: withdraw their own request before it is active. */
export const withdrawServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("withdraw_service_request", {
      _request_id: data.requestId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/* ------------------------------------------------------------------ pricing */

export const getPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const [{ data: versions }, { data: items }] = await Promise.all([
      context.supabase.from("pricing_versions").select("*").order("created_at", { ascending: false }),
      context.supabase.from("pricing_items").select("*").order("sort_order"),
    ]);
    return {
      versions: (versions ?? []).map((v: any) => ({
        ...v,
        items: (items ?? []).filter((i: any) => i.version_id === v.id),
      })),
    };
  });

export const savePricingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        version_id: z.string().uuid(),
        service_key: z.string().max(80).optional().or(z.literal("")),
        label: z.string().trim().min(2).max(160),
        category: z.string().max(40).default("other"),
        pricing_model: z.string().max(40).default("one_time"),
        amount_cents: z.number().int().min(0).nullable().optional(),
        unit: z.string().max(60).optional().or(z.literal("")),
        condition: z.string().max(300).optional().or(z.literal("")),
        pass_through: z.boolean().default(false),
        sort_order: z.number().int().default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: version } = await context.supabase
      .from("pricing_versions")
      .select("status")
      .eq("id", data.version_id)
      .maybeSingle();
    if (version?.status === "published" || version?.status === "archived") {
      throw new Error(
        "Published rate cards stay as they were agreed. Copy this one into a new version to change a fee.",
      );
    }
    const row = {
      version_id: data.version_id,
      service_key: data.service_key || null,
      label: data.label,
      category: data.category,
      pricing_model: data.pricing_model,
      amount_cents: data.amount_cents ?? null,
      unit: data.unit || null,
      condition: data.condition || null,
      pass_through: data.pass_through,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await context.supabase.from("pricing_items").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("pricing_items").insert(row);
      if (error) throw new Error(error.message);
    }
    await audit(context, who, {
      area: "pricing",
      action: data.id ? "item updated" : "item added",
      target: data.label,
      next: row,
    });
    return { ok: true };
  });

export const createPricingVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        label: z.string().trim().min(2).max(120),
        copyFromVersionId: z.string().uuid().optional(),
        effectiveDate: z.string().optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: version, error } = await context.supabase
      .from("pricing_versions")
      .insert({ label: data.label, effective_date: data.effectiveDate || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.copyFromVersionId) {
      const { data: items } = await context.supabase
        .from("pricing_items")
        .select("*")
        .eq("version_id", data.copyFromVersionId);
      if (items?.length) {
        await context.supabase.from("pricing_items").insert(
          items.map((i: any) => ({
            version_id: version.id,
            service_key: i.service_key,
            label: i.label,
            category: i.category,
            pricing_model: i.pricing_model,
            amount_cents: i.amount_cents,
            unit: i.unit,
            condition: i.condition,
            pass_through: i.pass_through,
            sort_order: i.sort_order,
          })),
        );
      }
    }
    await audit(context, who, { area: "pricing", action: "version created", target: data.label });
    return { id: version.id as string };
  });

export const publishPricingVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { error } = await context.supabase
      .from("pricing_versions")
      .update({ status: "published", published_at: new Date().toISOString(), published_by: who.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, { area: "pricing", action: "version published", target: data.id });
    return { ok: true };
  });

export const saveClientPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        client_id: z.string().uuid(),
        sow_id: z.string().uuid().nullable().optional(),
        service_key: z.string().max(80).optional().or(z.literal("")),
        label: z.string().trim().min(2).max(160),
        standard_cents: z.number().int().min(0).nullable().optional(),
        contracted_cents: z.number().int().min(0).nullable().optional(),
        discount_note: z.string().max(300).optional().or(z.literal("")),
        pricing_model: z.string().max(40).default("one_time"),
        version_id: z.string().uuid().nullable().optional(),
        effective_date: z.string().optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const row = {
      client_id: data.client_id,
      sow_id: data.sow_id ?? null,
      service_key: data.service_key || null,
      label: data.label,
      standard_cents: data.standard_cents ?? null,
      contracted_cents: data.contracted_cents ?? null,
      discount_note: data.discount_note || null,
      pricing_model: data.pricing_model,
      version_id: data.version_id ?? null,
      effective_date: data.effective_date || null,
      approved_by: who.userId,
      approved_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("client_pricing").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("client_pricing").insert(row);
      if (error) throw new Error(error.message);
    }
    await audit(context, who, {
      area: "pricing",
      action: "client price set",
      clientId: data.client_id,
      target: data.label,
      next: row,
    });
    return { ok: true };
  });

/* --------------------------------------------------------------- providers */

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("third_party_providers")
      .select("*")
      .order("provider_type")
      .order("name");
    if (error) throw new Error(error.message);
    return { providers: data ?? [] };
  });

export const saveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(160),
        provider_type: z.string().trim().min(2).max(60),
        service_dependency: z.string().max(300).optional().or(z.literal("")),
        data_categories: z.array(z.string()).default([]),
        contract_status: z.string().max(40).default("active"),
        security_doc_url: z.string().max(500).optional().or(z.literal("")),
        sla: z.string().max(300).optional().or(z.literal("")),
        status: z.string().max(40).default("operational"),
        outage_note: z.string().max(500).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const row = {
      name: data.name,
      provider_type: data.provider_type,
      service_dependency: data.service_dependency || null,
      data_categories: data.data_categories,
      contract_status: data.contract_status,
      security_doc_url: data.security_doc_url || null,
      sla: data.sla || null,
      status: data.status,
      outage_note: data.outage_note || null,
    };
    let previous: any = null;
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("third_party_providers")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      previous = existing ?? null;
      const { error } = await context.supabase
        .from("third_party_providers")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("third_party_providers").insert(row);
      if (error) throw new Error(error.message);
    }
    await audit(context, who, {
      area: "provider",
      action: data.id ? "updated" : "added",
      target: data.name,
      previous,
      next: row,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------- audit trail */

export const listContractAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid().optional(),
        areas: z.array(z.string().max(40)).optional(),
        limit: z.number().int().max(200).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    let query = context.supabase
      .from("contract_audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.clientId) query = query.eq("client_id", data.clientId);
    if (data.areas && data.areas.length > 0) query = query.in("area", data.areas);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { events: rows ?? [] };
  });

/* ------------------------------------------------- pricing console extras */

/** Everything the pricing and agreements console needs in one read. */
export const getPricingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const [{ data: versions }, { data: items }, { data: clients }, { data: prices }, { data: sows }, { data: catalog }, { data: funds }] =
      await Promise.all([
        context.supabase.from("pricing_versions").select("*").order("created_at", { ascending: false }),
        context.supabase.from("pricing_items").select("*").order("sort_order"),
        context.supabase.from("clients").select("id, name, status").order("name"),
        context.supabase.from("client_pricing").select("*").order("created_at", { ascending: false }),
        context.supabase.from("client_sows").select("*").order("created_at", { ascending: false }),
        context.supabase.from("service_catalog").select("key, name, category").eq("active", true).order("sort_order"),
        context.supabase.from("offerings").select("id, name, client_id").order("name"),
      ]);

    return {
      canManage: who.canManage,
      versions: (versions ?? []).map((v: any) => ({
        ...v,
        items: (items ?? []).filter((i: any) => i.version_id === v.id),
      })),
      clients: clients ?? [],
      clientPricing: prices ?? [],
      sows: sows ?? [],
      catalog: catalog ?? [],
      funds: funds ?? [],
    };
  });

export const deletePricingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: row } = await context.supabase
      .from("pricing_items")
      .select("*, pricing_versions(status)")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That line item isn't available.");
    if ((row as any).pricing_versions?.status === "published") {
      throw new Error("Published rate cards can't be edited. Copy it into a new version first.");
    }
    const { error } = await context.supabase.from("pricing_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "pricing",
      action: "item removed",
      target: (row as any).label,
      previous: row,
    });
    return { ok: true };
  });

export const deleteClientPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: row } = await context.supabase
      .from("client_pricing")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("client_pricing").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      area: "pricing",
      action: "client price removed",
      clientId: (row as any)?.client_id ?? null,
      target: (row as any)?.label ?? data.id,
      previous: row ?? null,
    });
    return { ok: true };
  });

export const archivePricingVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { error } = await context.supabase
      .from("pricing_versions")
      .update({ status: "archived" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, { area: "pricing", action: "version archived", target: data.id });
    return { ok: true };
  });

/* -------------------------------------------------- statement of work sign-off */

async function requireAdmin(context: any) {
  const who = await whoIs(context);
  if (!who.roles.some((r) => r === "admin" || r === "super_admin")) {
    throw new Error("Forbidden: only an administrator can approve a statement of work.");
  }
  return who;
}

/** Every statement of work with its approval state, for the approvals board. */
export const listSowApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const [{ data: sows, error }, { data: clients }, { data: funds }, { data: profiles }] =
      await Promise.all([
        context.supabase
          .from("client_sows")
          .select("*")
          .order("signed_on", { ascending: true, nullsFirst: false }),
        context.supabase.from("clients").select("id, legal_name, name"),
        context.supabase.from("offerings").select("id, name"),
        context.supabase.from("profiles").select("user_id, legal_name"),
      ]);
    if (error) throw new Error(error.message);

    const clientName = new Map(
      ((clients ?? []) as any[]).map((c) => [c.id as string, (c.legal_name ?? c.name) as string]),
    );
    const fundName = new Map(((funds ?? []) as any[]).map((f) => [f.id as string, f.name as string]));
    const person = new Map(
      ((profiles ?? []) as any[]).map((p) => [p.user_id as string, (p.legal_name as string) ?? ""]),
    );

    const rows = ((sows ?? []) as any[]).map((s) => ({
      id: s.id as string,
      clientId: (s.client_id as string) ?? null,
      clientName: clientName.get(s.client_id as string) ?? "Unassigned client",
      title: s.title as string,
      sowType: s.sow_type as string,
      status: s.status as string,
      effectiveDate: (s.effective_date as string) ?? null,
      signedBy: (s.signed_by as string) ?? null,
      signedOn: (s.signed_on as string) ?? null,
      offeringId: (s.offering_id as string) ?? null,
      fundName: s.offering_id ? (fundName.get(s.offering_id as string) ?? null) : null,
      approvalStatus: ((s.approval_status as string) ?? "pending") as
        | "pending"
        | "approved"
        | "rejected",
      approvalNote: (s.approval_note as string) ?? null,
      approvedAt: (s.approved_at as string) ?? null,
      approvedByName: s.approved_by ? (person.get(s.approved_by as string) || null) : null,
      signed: Boolean(s.signed_on) && Boolean(s.signed_by),
      clientStatus: ((s.client_status as string) ?? "pending") as "pending" | "signed" | "sent_back",
      clientSignatureName: (s.client_signature_name as string) ?? null,
      clientSignatureTitle: (s.client_signature_title as string) ?? null,
      clientSignedAt: (s.client_signed_at as string) ?? null,
      clientSentBackReason: (s.client_sent_back_reason as string) ?? null,
      clientSentBackAt: (s.client_sent_back_at as string) ?? null,
      hasDocument: Boolean(s.document_path),
    }));

    return { canDecide: who.roles.some((r) => r === "admin" || r === "super_admin"), rows };
  });

/** Administrator decision on a signed statement of work. */
export const decideSowApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "pending"]),
        note: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAdmin(context);
    const { data: sow, error } = await context.supabase
      .from("client_sows")
      .select(
        "id, client_id, offering_id, title, signed_on, signed_by, approval_status, client_status",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sow) throw new Error("That statement of work could not be found.");
    const row = sow as any;

    if (data.decision === "approved" && (!row.signed_on || !row.signed_by)) {
      throw new Error("Record the client signature before approving this statement of work.");
    }
    if (data.decision === "approved" && row.client_status !== "signed") {
      throw new Error(
        row.client_status === "sent_back"
          ? "The client sent this agreement back. Revise and re-issue it before approving."
          : "The client has not signed this agreement in their portal yet.",
      );
    }
    if (data.decision === "rejected" && !data.note) {
      throw new Error("Give a reason so the team knows what has to change.");
    }

    const patch =
      data.decision === "pending"
        ? { approval_status: "pending", approved_by: null, approved_at: null, approval_note: data.note || null }
        : {
            approval_status: data.decision,
            approved_by: who.userId,
            approved_at: new Date().toISOString(),
            approval_note: data.note || null,
          };

    const { error: updateError } = await context.supabase
      .from("client_sows")
      .update(patch as any)
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    await audit(context, who, {
      area: "sow",
      action: `approval ${data.decision}`,
      clientId: row.client_id,
      offeringId: row.offering_id,
      target: row.title,
      previous: { approval_status: row.approval_status },
      next: { approval_status: data.decision, note: data.note || null },
      approval: data.decision,
    });
    return { ok: true };
  });


/** Staff upload the agreement document (PDF or Word) so the client can read it
 *  before signing. Stored privately; the portal only ever gets a short-lived link. */
export const uploadSowDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        fileName: z.string().trim().min(1).max(200),
        contentBase64: z.string().min(1).max(40_000_000),
        contentType: z.string().trim().max(160).default("application/pdf"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: sow, error } = await context.supabase
      .from("client_sows")
      .select("id, client_id, offering_id, title, document_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sow) throw new Error("That statement of work could not be found.");

    const binary = Buffer.from(data.contentBase64, "base64");
    const safeName = data.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `client-sows/${data.id}/${Date.now()}-${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from("fund-formation")
      .upload(path, new Uint8Array(binary), { contentType: data.contentType, upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await context.supabase
      .from("client_sows")
      .update({ document_path: path } as any)
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    await audit(context, who, {
      area: "sow",
      action: "document uploaded",
      clientId: (sow as any).client_id,
      offeringId: (sow as any).offering_id,
      target: (sow as any).title,
      previous: { document_path: (sow as any).document_path ?? null },
      next: { document_path: path, file_name: data.fileName },
    });
    return { ok: true, path };
  });
