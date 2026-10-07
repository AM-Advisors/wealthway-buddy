// Service Engagements: authoritative Harmonious ↔ fund administration relationship.
// Tables are service-role only; every call re-checks authority server-side.
// Contracted prices are stored on the engagement and never change when pricing versions change.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const ADMIN_ROLES = ["admin", "super_admin"];
const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance", "account_manager", "sales_management", "cro"];

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function rolesOf(uid: string): Promise<string[]> {
  const { data } = await (await db()).from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).map((r) => r.role);
}
async function requireStaff(uid: string) {
  const r = await rolesOf(uid);
  if (!r.some((x) => STAFF_ROLES.includes(x))) throw new Error("Harmonious staff access is required.");
  return { isAdmin: r.some((x) => ADMIN_ROLES.includes(x)) };
}

const TEAM_FIELDS = ["primary_administrator_user_id", "secondary_administrator_user_id", "relationship_lead_user_id", "accounting_lead_user_id", "tax_coordinator_user_id", "compliance_coordinator_user_id"] as const;

export const listServiceEngagements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await requireStaff(context.userId);
    const d = await db();
    const [{ data: rows }, { data: pricing }, { data: features }, { data: staff }] = await Promise.all([
      d.from("service_engagements").select("*, offerings(name), clients(name)").order("created_at", { ascending: false }).limit(500),
      d.from("service_pricing_versions").select("*").eq("is_current", true),
      d.from("service_features").select("feature_key, name, category").eq("active", true).order("name"),
      d.rpc("list_staff_accounts"),
    ]);
    const { data: funds } = await d.from("offerings").select("id, name, client_id").is("consolidated_into", null).order("name").limit(1000);
    return { isAdmin, rows: rows ?? [], pricing: pricing ?? [], features: features ?? [], staff: (staff ?? []) as any[], funds: funds ?? [] };
  });

export const getServiceEngagementDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const d = await db();
    const { data: e } = await d.from("service_engagements").select("*").eq("id", data.id).maybeSingle();
    if (!e) throw new Error("Engagement not found.");
    const [{ data: defaults }, { data: overrides }, { data: events }] = await Promise.all([
      d.from("service_level_entitlements").select("feature_key").eq("service_product", e.service_product).eq("service_level", e.service_level),
      d.from("service_engagement_entitlements").select("*").eq("engagement_id", e.id),
      d.from("service_engagement_events").select("*").eq("engagement_id", e.id).order("changed_at", { ascending: false }).limit(200),
    ]);
    return { engagement: e, defaults: ((defaults ?? []) as any[]).map((x) => x.feature_key), overrides: overrides ?? [], events: events ?? [] };
  });

const Upsert = z.object({
  id: z.string().uuid().optional(),
  fund_id: z.string().uuid().nullable().optional(),
  service_product: z.string().min(2).max(60),
  service_level: z.enum(["CORE", "FUND_ADMINISTRATION", "WHITE_GLOVE", "INSTITUTIONAL"]),
  service_status: z.enum(["PROPOSED", "PENDING_AGREEMENT", "ACTIVE", "PAUSED", "CANCELLATION_PENDING", "CANCELLED", "EXPIRED"]).optional(),
  billing_frequency: z.enum(["ANNUAL", "QUARTERLY", "MONTHLY", "ONE_TIME", "CUSTOM"]).nullable().optional(),
  contracted_annual_value: z.number().min(0).nullable().optional(),
  recurring_invoice_amount: z.number().min(0).nullable().optional(),
  pricing_type: z.enum(["CURRENT", "GRANDFATHERED", "NEGOTIATED", "PROMOTIONAL", "CUSTOM"]).optional(),
  pricing_override_reason: z.string().max(1000).nullable().optional(),
  grandfathered: z.boolean().optional(),
  effective_date: z.string().nullable().optional(),
  contract_start_date: z.string().nullable().optional(),
  contract_end_date: z.string().nullable().optional(),
  renewal_date: z.string().nullable().optional(),
  renewal_type: z.enum(["AUTO_RENEW", "MANUAL_RENEWAL", "FIXED_TERM", "MONTH_TO_MONTH", "NONE"]).nullable().optional(),
  reporting_frequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"]).nullable().optional(),
  nav_frequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"]).nullable().optional(),
  response_sla: z.string().max(200).nullable().optional(),
  investor_limit: z.number().int().min(0).nullable().optional(),
  investment_limit: z.number().int().min(0).nullable().optional(),
  entity_limit: z.number().int().min(0).nullable().optional(),
  notes_internal: z.string().max(5000).nullable().optional(),
  primary_administrator_user_id: z.string().uuid().nullable().optional(),
  secondary_administrator_user_id: z.string().uuid().nullable().optional(),
  relationship_lead_user_id: z.string().uuid().nullable().optional(),
  accounting_lead_user_id: z.string().uuid().nullable().optional(),
  tax_coordinator_user_id: z.string().uuid().nullable().optional(),
  compliance_coordinator_user_id: z.string().uuid().nullable().optional(),
});

function cadencePrice(p: any, f: string | null | undefined) {
  if (!p) return null;
  if (f === "ANNUAL") return p.annual_price;
  if (f === "QUARTERLY") return p.quarterly_price;
  if (f === "MONTHLY") return p.monthly_price;
  return null;
}

export const saveServiceEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Upsert.parse(i))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await requireStaff(context.userId);
    const d = await db();
    const { id, ...fields } = data;
    const prior = id ? (await d.from("service_engagements").select("*").eq("id", id).maybeSingle()).data : null;
    if (id && !prior) throw new Error("Engagement not found.");
    const { data: price } = await d.from("service_pricing_versions").select("*")
      .eq("service_product", fields.service_product).eq("service_level", fields.service_level).eq("is_current", true).maybeSingle();

    const row: any = { ...fields, updated_by: context.userId };
    // New engagement (or tier change) snapshots the current list price; later price-version changes never touch it.
    const tierChanged = !prior || prior.service_level !== fields.service_level || prior.service_product !== fields.service_product;
    if (tierChanged && price) row.pricing_version_id = price.id;
    const pv = tierChanged ? price : prior ? (await d.from("service_pricing_versions").select("*").eq("id", prior.pricing_version_id).maybeSingle()).data : null;
    if (row.contracted_annual_value == null && pv && (!prior || tierChanged)) {
      row.contracted_annual_value = pv.annual_price ?? pv.starting_price ?? null;
    }
    if (row.recurring_invoice_amount == null && (!prior || tierChanged)) row.recurring_invoice_amount = cadencePrice(pv, fields.billing_frequency);

    const listAnnual = pv?.annual_price ?? pv?.starting_price ?? null;
    const isOverride = (fields.pricing_type && fields.pricing_type !== "CURRENT") || fields.grandfathered === true
      || (row.contracted_annual_value != null && listAnnual != null && Number(row.contracted_annual_value) !== Number(listAnnual) && fields.service_level !== "INSTITUTIONAL");
    const overrideChanged = !prior || isOverride && (prior.pricing_type !== fields.pricing_type || Number(prior.contracted_annual_value) !== Number(row.contracted_annual_value) || prior.grandfathered !== fields.grandfathered);
    if (isOverride && overrideChanged) {
      if (!isAdmin) throw new Error("Only a Harmonious Admin can apply negotiated, grandfathered or custom pricing.");
      if (!fields.pricing_override_reason || fields.pricing_override_reason.trim().length < 10) throw new Error("Give a reason (10+ characters) for the pricing override.");
    }
    if (fields.service_level === "CORE") row.included_at_no_charge = true;

    if (prior) {
      const { error } = await d.from("service_engagements").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    if (fields.fund_id) {
      const { data: f } = await d.from("offerings").select("client_id").eq("id", fields.fund_id).maybeSingle();
      row.client_id = f?.client_id ?? null;
    }
    row.created_by = context.userId;
    const { data: ins, error } = await d.from("service_engagements").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

export const setEngagementEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    engagement_id: z.string().uuid(), feature_key: z.string().min(2).max(80),
    mode: z.enum(["ADD", "REMOVE", "DEFAULT"]), limit_override: z.number().int().nullable().optional(),
    frequency_override: z.string().max(40).nullable().optional(), reason: z.string().max(500).nullable().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const d = await db();
    const { data: prior } = await d.from("service_engagement_entitlements").select("mode").eq("engagement_id", data.engagement_id).eq("feature_key", data.feature_key).maybeSingle();
    if (data.mode === "DEFAULT") {
      await d.from("service_engagement_entitlements").delete().eq("engagement_id", data.engagement_id).eq("feature_key", data.feature_key);
    } else {
      const { error } = await d.from("service_engagement_entitlements").upsert({
        engagement_id: data.engagement_id, feature_key: data.feature_key, mode: data.mode,
        limit_override: data.limit_override ?? null, frequency_override: data.frequency_override ?? null,
        reason: data.reason ?? null, created_by: context.userId,
      }, { onConflict: "engagement_id,feature_key" });
      if (error) throw new Error(error.message);
    }
    await d.from("service_engagement_events").insert({
      engagement_id: data.engagement_id, field: `entitlement:${data.feature_key}`,
      old_value: prior?.mode ?? "DEFAULT", new_value: data.mode, reason: data.reason ?? null, changed_by: context.userId,
    });
    return { ok: true };
  });

/** Client-safe view for Fund > Services. Never returns notes, override reasons or internal data. */
export const getFundServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ fundId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, data.fundId);
    const d = await db();
    const { data: rows } = await d.from("service_engagements")
      .select(`id, service_product, service_level, service_status, contracted_annual_value, billing_frequency, recurring_invoice_amount, currency, effective_date, renewal_date, reporting_frequency, nav_frequency, included_at_no_charge, ${TEAM_FIELDS.join(", ")}`)
      .eq("fund_id", data.fundId).not("service_status", "in", "(CANCELLED,EXPIRED)").order("created_at");
    const list = (rows ?? []) as any[];
    const ids = [...new Set(list.flatMap((r) => [r.primary_administrator_user_id, r.relationship_lead_user_id]).filter(Boolean))];
    const { data: profs } = ids.length ? await d.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
    const names = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
    const out = [];
    for (const r of list) {
      const [{ data: defs }, { data: ov }] = await Promise.all([
        d.from("service_level_entitlements").select("feature_key, service_features(name)").eq("service_product", r.service_product).eq("service_level", r.service_level),
        d.from("service_engagement_entitlements").select("feature_key, mode, service_features(name)").eq("engagement_id", r.id),
      ]);
      const removed = new Set(((ov ?? []) as any[]).filter((o) => o.mode === "REMOVE").map((o) => o.feature_key));
      out.push({
        id: r.id, service_product: r.service_product, service_level: r.service_level, service_status: r.service_status,
        contracted_annual_value: r.contracted_annual_value, billing_frequency: r.billing_frequency,
        recurring_invoice_amount: r.recurring_invoice_amount, currency: r.currency, effective_date: r.effective_date,
        renewal_date: r.renewal_date, reporting_frequency: r.reporting_frequency, included_at_no_charge: r.included_at_no_charge,
        primary_administrator: names.get(r.primary_administrator_user_id) ?? null,
        relationship_lead: names.get(r.relationship_lead_user_id) ?? null,
        included: ((defs ?? []) as any[]).filter((x) => !removed.has(x.feature_key)).map((x) => x.service_features?.name ?? x.feature_key),
        additional: ((ov ?? []) as any[]).filter((o) => o.mode === "ADD").map((o) => o.service_features?.name ?? o.feature_key),
      });
    }
    return out;
  });

/** Public pricing (current versions only). */
export const getPublicServicePricing = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const c = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => { const h = new Headers(init?.headers); if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); } },
  });
  const { data } = await c.from("service_pricing_versions").select("service_product, service_level, annual_price, quarterly_price, monthly_price, starting_price").eq("is_current", true);
  return (data ?? []) as { service_product: string; service_level: string; annual_price: number | null; quarterly_price: number | null; monthly_price: number | null; starting_price: number | null }[];
});
