import type Stripe from "stripe";

import { CAP_TABLE_TIERS, priceIdFor } from "@/lib/cap-table-tiers";

const PORTAL_TAG = "harmonious_billing_v1";

/**
 * Billing page settings: upgrades charge the prorated difference right away, downgrades
 * and shorter billing intervals wait until renewal, cancellation keeps access until the paid period ends.
 */
export async function ensurePortalConfig(stripe: Stripe): Promise<string> {
  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const hit = existing.data.find((c) => c.metadata?.["tag"] === PORTAL_TAG);
  if (hit) return hit.id;
  const keys = CAP_TABLE_TIERS.filter((t) => t.monthlyCents && !t.contactSales)
    .flatMap((t) => [priceIdFor(t.key, "monthly"), priceIdFor(t.key, "annual")]);
  const prices = await stripe.prices.list({ lookup_keys: keys, limit: 100 });
  const byProduct = new Map<string, string[]>();
  for (const p of prices.data) {
    const prod = typeof p.product === "string" ? p.product : p.product.id;
    byProduct.set(prod, [...(byProduct.get(prod) ?? []), p.id]);
  }
  const cfg = await stripe.billingPortal.configurations.create({
    metadata: { tag: PORTAL_TAG },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "always_invoice",
        products: [...byProduct].map(([product, ids]) => ({ product, prices: ids })),
        schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }, { type: "shortening_interval" }] },
      },
    },
  } as any);
  return cfg.id;
}

/** One Stripe customer per client and environment. */
export async function customerForClient(stripe: Stripe, clientId: string, email?: string | null, userId?: string) {
  const found = await stripe.customers.search({ query: `metadata['clientId']:'${clientId}'`, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const c = await stripe.customers.create({ ...(email ? { email } : {}), metadata: { clientId, ...(userId ? { userId } : {}) } });
  return c.id;
}

/** Recomputes cap table plan entitlements from every subscription the client has (never per single row). */
export async function syncClientCapEntitlements(db: any, clientId: string) {
  const { data: subs } = await db.from("cap_table_subscriptions").select("tier, status, current_period_end").eq("client_id", clientId);
  const now = Date.now();
  const on = new Set<string>();
  const seen = new Set<string>();
  for (const s of (subs ?? []) as any[]) {
    seen.add(s.tier);
    const graceful = s.status === "cancelled" && s.current_period_end && new Date(s.current_period_end).getTime() > now;
    if (s.status === "active" || s.status === "past_due" || graceful) on.add(s.tier);
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const tier of seen) {
    const key = `cap_table_${tier}`;
    const { data: ex } = await db.from("service_entitlements").select("id, status").eq("client_id", clientId).is("offering_id", null).eq("service_key", key).maybeSingle();
    if (on.has(tier)) {
      const row = { status: "included", pricing_model: "recurring", effective_date: today, termination_date: null, note: "Cap table subscription" };
      if (ex) { if (ex.status !== "included") await db.from("service_entitlements").update(row).eq("id", ex.id); }
      else await db.from("service_entitlements").insert({ client_id: clientId, service_key: key, ...row });
    } else if (ex && ex.status === "included") {
      await db.from("service_entitlements").update({ status: "not_included", termination_date: today }).eq("id", ex.id);
    }
  }
}
