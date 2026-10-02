import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { CAP_TABLE_TIERS, priceIdFor } from "@/lib/cap-table-tiers";

const STAFF = ["admin", "super_admin", "operations", "client_success", "executive"];
const envSchema = z.enum(["sandbox", "live"]);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function who(context: any) {
  const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const staff = ((roles ?? []) as any[]).some((r) => STAFF.includes(String(r.role)));
  const { data: link } = await context.supabase.from("client_users").select("client_id, client_role").eq("user_id", context.userId).limit(1).maybeSingle();
  return { clientId: (link?.client_id ?? null) as string | null, canManage: staff || link?.client_role === "client_gp" };
}

export async function grantCapEntitlement(db: any, clientId: string, tier: string, on: boolean) {
  const key = `cap_table_${tier}`;
  const { data: existing } = await db.from("service_entitlements").select("id").eq("client_id", clientId).is("offering_id", null).eq("service_key", key).maybeSingle();
  const row = on
    ? { status: "included", pricing_model: "recurring", effective_date: new Date().toISOString().slice(0, 10), termination_date: null, note: "Cap table subscription" }
    : { status: "not_included", termination_date: new Date().toISOString().slice(0, 10) };
  if (existing) await db.from("service_entitlements").update(row).eq("id", existing.id);
  else if (on) await db.from("service_entitlements").insert({ client_id: clientId, service_key: key, ...row });
}

/** The caller's cap tables and whether any is active (paid/free subscription or an existing included plan). */
export const getMyCapTables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ environment: envSchema.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const w = await who(context);
    if (!w.clientId) return { clientId: null, canManage: false, hasActive: false, subscriptions: [] as any[] };
    const db = await admin();
    let q = db.from("cap_table_subscriptions").select("id, company_name, tier, billing_interval, status, current_period_end, cancel_at_period_end, created_at, environment")
      .eq("client_id", w.clientId).order("created_at", { ascending: false });
    if (data.environment) q = q.eq("environment", data.environment);
    const [{ data: subs }, { data: ents }] = await Promise.all([
      q,
      db.from("service_entitlements").select("service_key, status").eq("client_id", w.clientId).like("service_key", "cap_table_%").eq("status", "included"),
    ]);
    const list = (subs ?? []) as any[];
    const now = Date.now();
    const hasActive = list.some((s) => s.status === "active" || s.status === "past_due"
      || (s.status === "cancelled" && s.current_period_end && new Date(s.current_period_end).getTime() > now)) || ((ents ?? []) as any[]).length > 0;
    return { clientId: w.clientId, canManage: w.canManage, hasActive, subscriptions: list };
  });

export const getCapTableSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await (context.supabase as any).from("cap_table_subscriptions").select("id, status, tier, company_name").eq("id", data.id).maybeSingle();
    return (row ?? null) as { id: string; status: string; tier: string; company_name: string } | null;
  });

/** Starts a cap table: records the company and subscription, then opens card checkout for paid tiers. */
export const startCapTableCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    companyName: z.string().trim().min(1).max(200),
    legalName: z.string().trim().max(200).optional(),
    tier: z.enum(["free", "starter", "growth", "scale", "enterprise"]),
    interval: z.enum(["monthly", "annual"]),
    environment: envSchema,
    returnUrl: z.string().url().max(500),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ subscriptionId: string; mode: "free" | "sales" | "checkout"; clientSecret?: string } | { error: string }> => {
    const w = await who(context);
    if (!w.clientId) return { error: "Your account isn't linked to a client yet." };
    if (!w.canManage) return { error: "Only the client's general partners or Harmonious can add a cap table." };
    const tier = CAP_TABLE_TIERS.find((t) => t.key === data.tier)!;
    const db = await admin();
    // Abandoned checkouts: drop earlier unpaid attempts for the same company so retries don't pile up.
    await db.from("cap_table_subscriptions").update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("client_id", w.clientId).eq("status", "pending_payment").ilike("company_name", data.companyName);
    const { data: company, error: cErr } = await db.from("ct_companies")
      .insert({ client_id: w.clientId, name: data.companyName, legal_name: data.legalName || null }).select("id").single();
    if (cErr) return { error: cErr.message };
    const status = tier.key === "free" ? "active" : tier.contactSales ? "sales_requested" : "pending_payment";
    const { data: sub, error } = await db.from("cap_table_subscriptions").insert({
      client_id: w.clientId, company_id: company.id, company_name: data.companyName, tier: tier.key,
      billing_interval: data.interval, status, environment: data.environment, created_by: context.userId,
      price_id: tier.monthlyCents ? priceIdFor(tier.key, data.interval) : null,
    }).select("id").single();
    if (error) return { error: error.message };
    await db.from("cap_table_subscription_events").insert({ subscription_id: sub.id, actor_id: context.userId, event_kind: "created", detail: { tier: tier.key, interval: data.interval } });
    await db.from("contract_audit_events").insert({
      actor_id: context.userId, actor_role: "client", client_id: w.clientId, area: "cap_table",
      action: tier.contactSales ? "client requested Enterprise cap table pricing" : `client added a cap table (${tier.name})`, target: data.companyName, source: "web",
    });
    if (tier.key === "free") {
      const { syncClientCapEntitlements } = await import("@/lib/billing.server");
      await syncClientCapEntitlements(db, w.clientId);
      return { subscriptionId: sub.id, mode: "free" };
    }
    if (tier.contactSales) return { subscriptionId: sub.id, mode: "sales" };

    try {
      const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
      try {
        const stripe = createStripeClient(data.environment);
        const prices = await stripe.prices.list({ lookup_keys: [priceIdFor(tier.key, data.interval)] });
        const price = prices.data[0];
        if (!price) return { error: "That price isn't available yet." };
        const { data: { user } } = await context.supabase.auth.getUser();
        const { customerForClient } = await import("@/lib/billing.server");
        const customerId = await customerForClient(stripe, w.clientId, user?.email, context.userId);
        await db.from("cap_table_subscriptions").update({ stripe_customer_id: customerId }).eq("id", sub.id);
        const meta = { capSubId: sub.id, clientId: w.clientId, userId: context.userId, tier: tier.key };
        const session = await stripe.checkout.sessions.create({
          line_items: [{ price: price.id, quantity: 1 }],
          mode: "subscription",
          ui_mode: "embedded_page" as any,
          return_url: data.returnUrl.replace("SUB_ID", sub.id),
          customer: customerId,
          metadata: meta,
          subscription_data: { metadata: meta },
          managed_payments: { enabled: true },
        } as any);
        return { subscriptionId: sub.id, mode: "checkout", clientSecret: session.client_secret ?? "" };
      } catch (e) {
        return { error: getStripeErrorMessage(e) };
      }
    } catch {
      return { error: "Card payments are not available right now." };
    }
  });

/** Opens the billing page where clients change tier, update their card or cancel. */
export const openCapTableBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ environment: envSchema, returnUrl: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    const w = await who(context);
    if (!w.clientId || !w.canManage) return { error: "Not allowed." };
    const db = await admin();
    const { data: sub } = await db.from("cap_table_subscriptions").select("stripe_customer_id").eq("client_id", w.clientId)
      .eq("environment", data.environment).not("stripe_customer_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub?.stripe_customer_id) return { error: "No card billing on file yet." };
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient(data.environment);
      const { ensurePortalConfig } = await import("@/lib/billing.server");
      const configuration = await ensurePortalConfig(stripe);
      const portal = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: data.returnUrl, configuration });
      return { url: portal.url };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });
