import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

/** Categories are data, not code paths — adding one never needs a redesign. */
export const SERVICE_CATEGORIES = [
  { value: "administration", label: "Administration" },
  { value: "cap_table", label: "Cap table" },
  { value: "investor_services", label: "Investor services" },
  { value: "compliance", label: "Compliance" },
  { value: "banking", label: "Banking" },
  { value: "tax", label: "Tax" },
  { value: "accounting", label: "Accounting" },
  { value: "regulatory", label: "Regulatory" },
  { value: "entity_services", label: "Entity services" },
  { value: "transactions", label: "Transactions" },
  { value: "migration", label: "Migration" },
  { value: "other", label: "Other" },
] as const;

export const PRICING_MODELS = [
  { value: "one_time", label: "One-time" },
  { value: "annual", label: "Annual" },
  { value: "recurring", label: "Recurring" },
  { value: "transaction", label: "Per transaction" },
  { value: "per_request", label: "Quoted per request" },
  { value: "pass_through", label: "Billed at cost" },
] as const;

export const SERVICE_BILLING_FREQUENCIES = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "per_event", label: "Per event" },
] as const;

export const SERVICE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "retired", label: "Retired" },
] as const;

/**
 * Delivery workflows a service can start once its agreement is executed.
 * Adding a workflow here makes it selectable on any service — no code branch per service.
 */
export const DELIVERY_WORKFLOWS = [
  { value: "fund_onboarding", label: "Fund onboarding", path: "/admin/setup" },
  { value: "kyc_aml_setup", label: "KYC/AML verification setup", path: "/onboarding/compliance" },
  { value: "cap_table_onboarding", label: "Cap table onboarding", path: "/client/cap-table" },
  { value: "migration_center", label: "Migration centre", path: "/client/cap-table/migration" },
  {
    value: "entity_information",
    label: "Entity information collection",
    path: "/client/entities",
  },
  { value: "filing_intake", label: "Filing intake", path: "/client/services" },
  { value: "tax_information", label: "Tax information collection", path: "/client/services" },
  { value: "transaction_intake", label: "Transaction intake", path: "/client/services" },
  { value: "investor_onboarding", label: "Investor onboarding", path: "/admin/applications" },
  { value: "banking_setup", label: "Banking setup", path: "/client/banking" },
  { value: "none", label: "No automatic workflow", path: null },
] as const;

export const workflowLabel = (key: string | null) =>
  DELIVERY_WORKFLOWS.find((w) => w.value === key)?.label ?? key ?? "—";

export const workflowPath = (key: string | null) =>
  DELIVERY_WORKFLOWS.find((w) => w.value === key)?.path ?? null;

export const categoryLabel = (v: string | null) =>
  SERVICE_CATEGORIES.find((c) => c.value === v)?.label ?? v ?? "Other";

export async function whoIsStaff(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    roles,
    isStaff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)),
    canManage: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
  };
}

async function requireAuthority(context: any) {
  const who = await whoIsStaff(context);
  if (!who.canManage) {
    throw new Error(
      "Forbidden: changing the service catalogue needs legal, compliance, finance, client success or admin authority.",
    );
  }
  return who;
}

const list = (v: unknown) =>
  Array.isArray(v)
    ? (v as string[]).map((s) => s.trim()).filter(Boolean)
    : String(v ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

const blank = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : (s as any);
};

export type CatalogService = {
  id: string;
  key: string;
  serviceCode: string | null;
  name: string;
  category: string;
  description: string | null;
  standardPriceCents: number;
  pricingModel: string;
  billingFrequency: string;
  applicableEntityTypes: string[];
  standardScope: string | null;
  standardDeliverables: string[];
  standardExclusions: string[];
  requiredInformation: string[];
  requiredDocuments: string[];
  contractTerms: string | null;
  dependencies: string[];
  onboardingWorkflow: string | null;
  deliveryWorkflow: string | null;
  internalOwner: string | null;
  renewalRule: string | null;
  status: string;
  sortOrder: number;
};

const mapService = (s: any): CatalogService => ({
  id: s.id,
  key: s.key,
  serviceCode: s.service_code ?? null,
  name: s.name,
  category: s.category ?? "other",
  description: s.description ?? null,
  standardPriceCents: Number(s.standard_price_cents ?? 0),
  pricingModel: s.default_pricing_model ?? "one_time",
  billingFrequency: s.billing_frequency ?? "one_time",
  applicableEntityTypes: (s.applicable_entity_types ?? []) as string[],
  standardScope: s.standard_scope ?? null,
  standardDeliverables: (s.standard_deliverables ?? []) as string[],
  standardExclusions: (s.standard_exclusions ?? []) as string[],
  requiredInformation: (s.required_information ?? []) as string[],
  requiredDocuments: (s.required_documents ?? []) as string[],
  contractTerms: s.contract_terms ?? null,
  dependencies: (s.dependencies ?? []) as string[],
  onboardingWorkflow: s.onboarding_workflow ?? null,
  deliveryWorkflow: s.delivery_workflow ?? null,
  internalOwner: s.internal_owner ?? null,
  renewalRule: s.renewal_rule ?? null,
  status: s.status ?? "active",
  sortOrder: Number(s.sort_order ?? 0),
});

/** The whole catalogue plus packages. Signed-in clients see active services only. */
export const listServiceCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ entityType: z.string().optional(), includeInactive: z.boolean().optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIsStaff(context);

    const [servicesRes, packagesRes, itemsRes] = await Promise.all([
      context.supabase.from("service_catalog").select("*").order("sort_order").order("name"),
      context.supabase.from("service_packages").select("*").order("sort_order").order("name"),
      context.supabase.from("service_package_items").select("*").order("sort_order"),
    ]);
    if (servicesRes.error) throw new Error(servicesRes.error.message);

    let services = ((servicesRes.data ?? []) as any[]).map(mapService);
    if (!who.isStaff || !data.includeInactive) {
      services = services.filter((s) => s.status === "active");
    }
    if (data.entityType) {
      services = services.filter(
        (s) =>
          s.applicableEntityTypes.length === 0 ||
          s.applicableEntityTypes.includes(data.entityType as string),
      );
    }

    const items = (itemsRes.data ?? []) as any[];

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      categories: SERVICE_CATEGORIES,
      services,
      packages: ((packagesRes.data ?? []) as any[]).map((p) => ({
        id: p.id as string,
        code: p.code as string,
        name: p.name as string,
        description: (p.description as string) ?? null,
        applicableEntityTypes: (p.applicable_entity_types ?? []) as string[],
        status: p.status as string,
        services: items
          .filter((i) => i.package_id === p.id)
          .map((i) => {
            const svc = services.find((s) => s.id === i.service_id);
            return {
              id: i.id as string,
              serviceId: i.service_id as string,
              optional: Boolean(i.optional),
              name: svc?.name ?? "Service",
              key: svc?.key ?? "",
              standardPriceCents: svc?.standardPriceCents ?? 0,
              pricingModel: svc?.pricingModel ?? "one_time",
            };
          }),
      })),
    };
  });

const serviceInput = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(2),
  serviceCode: z.string().optional().nullable(),
  name: z.string().min(2),
  category: z.string().min(2),
  description: z.string().optional().nullable(),
  standardPriceCents: z.number().int().min(0).default(0),
  pricingModel: z.string().default("one_time"),
  billingFrequency: z.string().default("one_time"),
  applicableEntityTypes: z.array(z.string()).default([]),
  standardScope: z.string().optional().nullable(),
  standardDeliverables: z.union([z.string(), z.array(z.string())]).optional(),
  standardExclusions: z.union([z.string(), z.array(z.string())]).optional(),
  requiredInformation: z.union([z.string(), z.array(z.string())]).optional(),
  requiredDocuments: z.union([z.string(), z.array(z.string())]).optional(),
  contractTerms: z.string().optional().nullable(),
  dependencies: z.array(z.string()).default([]),
  onboardingWorkflow: z.string().optional().nullable(),
  deliveryWorkflow: z.string().optional().nullable(),
  internalOwner: z.string().optional().nullable(),
  renewalRule: z.string().optional().nullable(),
  status: z.enum(["active", "draft", "retired"]).default("active"),
  sortOrder: z.number().int().default(0),
});

/** Create or update one catalogue service. */
export const saveCatalogService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => serviceInput.parse(data))
  .handler(async ({ context, data }) => {
    await requireAuthority(context);

    const row = {
      key: data.key.trim().toLowerCase().replace(/\s+/g, "_"),
      service_code: blank(data.serviceCode) ?? data.key.trim().toUpperCase().replace(/\s+/g, "_"),
      name: data.name.trim(),
      category: data.category,
      description: blank(data.description),
      standard_price_cents: data.standardPriceCents,
      default_pricing_model: data.pricingModel,
      billing_frequency: data.billingFrequency,
      applicable_entity_types: data.applicableEntityTypes,
      standard_scope: blank(data.standardScope),
      standard_deliverables: list(data.standardDeliverables),
      standard_exclusions: list(data.standardExclusions),
      required_information: list(data.requiredInformation),
      required_documents: list(data.requiredDocuments),
      contract_terms: blank(data.contractTerms),
      dependencies: data.dependencies,
      onboarding_workflow: blank(data.onboardingWorkflow),
      delivery_workflow: blank(data.deliveryWorkflow),
      internal_owner: blank(data.internalOwner),
      renewal_rule: blank(data.renewalRule),
      status: data.status,
      active: data.status === "active",
      sort_order: data.sortOrder,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("service_catalog")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await context.supabase.from("contract_audit_events").insert({
        actor_id: context.userId,
        area: "service_catalog",
        source: "portal",
        action: "service_updated",
        target: data.id,
        new_value: row as any,
      });
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("service_catalog")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId,
      area: "service_catalog",
      source: "portal",
      action: "service_created",
      target: (created as any).id,
      new_value: row as any,
    });
    return { id: (created as any).id as string };
  });

/** Create or update a package and the services inside it. */
export const saveServicePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().min(2),
        name: z.string().min(2),
        description: z.string().optional().nullable(),
        applicableEntityTypes: z.array(z.string()).default([]),
        status: z.enum(["active", "draft", "retired"]).default("active"),
        serviceIds: z.array(z.string().uuid()).default([]),
        optionalServiceIds: z.array(z.string().uuid()).default([]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await requireAuthority(context);

    const row = {
      code: data.code.trim().toUpperCase().replace(/\s+/g, "_"),
      name: data.name.trim(),
      description: blank(data.description),
      applicable_entity_types: data.applicableEntityTypes,
      status: data.status,
    };

    let packageId = data.id ?? null;
    if (packageId) {
      const { error } = await context.supabase
        .from("service_packages")
        .update(row)
        .eq("id", packageId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await context.supabase
        .from("service_packages")
        .insert({ ...row, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      packageId = (created as any).id as string;
    }

    await context.supabase.from("service_package_items").delete().eq("package_id", packageId);
    if (data.serviceIds.length > 0) {
      const { error } = await context.supabase.from("service_package_items").insert(
        data.serviceIds.map((serviceId, index) => ({
          package_id: packageId,
          service_id: serviceId,
          optional: data.optionalServiceIds.includes(serviceId),
          sort_order: index,
        })),
      );
      if (error) throw new Error(error.message);
    }

    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId,
      area: "service_catalog",
      source: "portal",
      action: data.id ? "package_updated" : "package_created",
      target: packageId,
      new_value: { ...row, services: data.serviceIds } as any,
    });

    return { id: packageId as string };
  });
