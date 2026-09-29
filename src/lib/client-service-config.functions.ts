/**
 * Client Expected Services (Phase 3.10B): append-only, versioned Client-level
 * service configuration priced from the canonical rate card. Intent only —
 * never rewrites a Fund's Services & Pricing Snapshot or gates any workflow.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CAP_TIERS, clientServiceStatus, entitlementsFor, mapLegacyServices, priceConfig, selectedPackages,
  validateConfig, type ClientServiceConfig, type RateItem,
} from "@/lib/service-packages";

async function gate(context: any, action: "see" | "prepare") {
  const { requireOperations } = await import("@/lib/ops-access.functions");
  return requireOperations(context, "clients", action);
}
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

async function loadRate(db: any): Promise<{ versionId: string | null; rate: RateItem[] }> {
  const { data: version } = await db.from("pricing_versions").select("id").eq("status", "published")
    .order("effective_date", { ascending: false }).limit(1).maybeSingle();
  if (!version) return { versionId: null, rate: [] };
  // Cap table tiers live on their own published catalog; include every published version, newest first.
  const { data: versions } = await db.from("pricing_versions").select("id, effective_date").eq("status", "published").order("effective_date", { ascending: false });
  const ids = ((versions ?? []) as any[]).map((v) => v.id);
  const { data: items } = await db.from("pricing_items").select("version_id, service_key, label, amount_cents, pricing_model, pass_through, category, sort_order").in("version_id", ids);
  const order = new Map(ids.map((id: string, i: number) => [id, i]));
  const rate = ((items ?? []) as any[])
    .sort((a, b) => (order.get(a.version_id)! - order.get(b.version_id)!) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => ({ serviceKey: i.service_key || null, label: i.label, amountCents: i.amount_cents == null ? null : Number(i.amount_cents), pricingModel: i.pricing_model, passThrough: Boolean(i.pass_through), category: i.category }));
  return { versionId: version.id, rate };
}

async function catalogNames(db: any) {
  const { data } = await db.from("service_catalog").select("key, name, category").eq("active", true).order("sort_order");
  return (data ?? []) as { key: string; name: string; category: string }[];
}

export async function currentClientConfig(db: any, clientId: string) {
  const { data } = await db.from("client_service_configurations").select("*").eq("client_id", clientId).is("superseded_at", null).maybeSingle();
  return data as any | null;
}

export const getClientServiceSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await gate(context, "see");
    const db = await admin();
    const [{ rate }, catalog, { data: masters }, { data: client }, { data: history }] = await Promise.all([
      loadRate(db), catalogNames(db),
      db.from("harmonious_series_masters").select("id, name, jurisdiction").eq("active", true).order("name"),
      db.from("clients").select("id, expected_services").eq("id", data.clientId).maybeSingle(),
      db.from("client_service_configurations").select("id, version, config, pricing, mapping_review, effective_date, changed_by, created_at, superseded_at, reason").eq("client_id", data.clientId).order("version", { ascending: false }),
    ]);
    if (!client) throw new Error("Not found.");
    const current = ((history ?? []) as any[]).find((h) => !h.superseded_at) ?? null;
    const legacy = ((client as any).expected_services ?? []) as string[];
    const proposal = current ? null : mapLegacyServices(legacy);
    return {
      rate, catalog, masters: (masters ?? []) as { id: string; name: string; jurisdiction: string | null }[],
      current: current ? { config: current.config as ClientServiceConfig, pricing: current.pricing, mappingReview: current.mapping_review as string[], version: current.version } : null,
      history: ((history ?? []) as any[]).map((h) => ({ version: h.version, packages: selectedPackages(h.config), createdAt: h.created_at, reason: h.reason, current: !h.superseded_at })),
      legacy, proposal,
      status: clientServiceStatus(current ? { mappingReview: current.mapping_review } : null, legacy),
    };
  });

const configSchema = z.object({
  spv: z.object({ structure: z.enum(["standard", "series"]), masterId: z.string().uuid().nullable().optional(), expectedRaiseCents: z.number().int().min(0).nullable().optional(), formationState: z.string().trim().max(60).nullable().optional() }).nullable().optional(),
  fund: z.object({ management: z.boolean(), formationState: z.string().trim().max(60).nullable().optional() }).nullable().optional(),
  capTable: z.object({ tier: z.enum(CAP_TIERS as [string, ...string[]]) }).nullable().optional(),
  investorOnboarding: z.object({ billing: z.enum(["annual", "per_investor"]).nullable() }).nullable().optional(),
  taxes: z.object({ sets: z.number().int().min(1).max(100) }).nullable().optional(),
  financialReporting: z.object({ reports: z.number().int().min(1).max(100) }).nullable().optional(),
  alaCarte: z.array(z.object({ serviceKey: z.string().max(80), quantity: z.number().int().min(1).max(1000) })).max(40).optional(),
});

/** Appends a new version; the previous one is superseded, never overwritten. */
export const saveClientServiceConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), config: configSchema, reason: z.string().trim().max(500).optional().default(""), mappingReview: z.array(z.string().max(80)).max(60).optional().default([]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "prepare");
    const db = await admin();
    const config = data.config as ClientServiceConfig;
    const [{ versionId, rate }, catalog, { data: masters }, { data: client }] = await Promise.all([
      loadRate(db), catalogNames(db), db.from("harmonious_series_masters").select("id").eq("active", true),
      db.from("clients").select("id, expected_services").eq("id", data.clientId).maybeSingle(),
    ]);
    if (!client) throw new Error("Not found.");
    const known = new Set(catalog.map((c) => c.key));
    config.alaCarte = (config.alaCarte ?? []).filter((a) => known.has(a.serviceKey));
    const errors = validateConfig(config, ((masters ?? []) as any[]).map((m) => m.id));
    if (errors.length) throw new Error(errors[0]);
    const names = Object.fromEntries(catalog.map((c) => [c.key, c.name]));
    const pricing = priceConfig(config, rate, names);
    // Billing chosen → that review item is resolved.
    const review = data.mappingReview.filter((r) => !(r === "investor_onboarding_billing" && (config.investorOnboarding?.billing || config.spv)));
    const current = await currentClientConfig(db, data.clientId);
    if (current) {
      const { error } = await db.from("client_service_configurations").update({ superseded_at: new Date().toISOString() }).eq("id", current.id);
      if (error) throw new Error(error.message);
    }
    const { error } = await db.from("client_service_configurations").insert({
      client_id: data.clientId, version: (current?.version ?? 0) + 1, config, pricing, entitlements: entitlementsFor(config),
      legacy_services: ((client as any).expected_services ?? []) as string[], mapping_review: review,
      pricing_version_id: versionId, reason: data.reason || null, changed_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await db.from("clients").update({ intake_step: 4 }).eq("id", data.clientId).eq("intake_status", "draft");
    await db.from("contract_audit_events").insert({
      actor_id: context.userId, actor_role: roles.join(", ") || null, client_id: data.clientId, area: "client",
      action: "expected services saved", previous_value: current ? { version: current.version, packages: selectedPackages(current.config) } : null,
      new_value: { version: (current?.version ?? 0) + 1, packages: selectedPackages(config) }, source: "web",
    });
    return { ok: true, pricing };
  });

/** Proposed Fund services from the Client's current Expected Services (staff choose per Fund). */
export const getProposedFundServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await gate(context, "see");
    const db = await admin();
    const current = await currentClientConfig(db, data.clientId);
    if (!current) return { packages: [] as { key: string; label: string; defaultOn: boolean }[] };
    const c = current.config as ClientServiceConfig;
    const { PACKAGES } = await import("@/lib/service-packages");
    const packages = selectedPackages(c).map((k) => ({ key: k, label: PACKAGES[k]!.label, defaultOn: true }));
    if (c.capTable) packages.push({ key: "cap_table", label: `Cap Table Management — ${c.capTable.tier}`, defaultOn: false });
    if ((c.alaCarte ?? []).length) packages.push({ key: "ala_carte", label: "À la carte services", defaultOn: true });
    return { packages };
  });
