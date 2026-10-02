import { createFileRoute } from "@tanstack/react-router";

import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

const STATUS: Record<string, string> = {
  active: "active", trialing: "active", past_due: "past_due",
  canceled: "cancelled", unpaid: "cancelled", incomplete_expired: "cancelled", incomplete: "pending_payment", paused: "past_due",
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function parts(sub: any) {
  const item = sub.items?.data?.[0];
  const priceId: string | undefined = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  return {
    priceId,
    periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    customer: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
  };
}

async function syncCapSubscription(sub: any, env: StripeEnv, deleted: boolean) {
  const capSubId = sub.metadata?.capSubId;
  const d = await db();
  let q = d.from("cap_table_subscriptions").select("id, client_id, tier, status, environment");
  q = capSubId ? q.eq("id", capSubId) : q.eq("stripe_subscription_id", sub.id);
  const { data: row } = await q.maybeSingle();
  if (!row || row.environment !== env) return;
  const { priceId, periodEnd, customer } = parts(sub);
  const tier = priceId?.match(/^cap_table_(\w+?)_(monthly|annual)$/)?.[1] ?? row.tier;
  const interval = priceId?.endsWith("_annual") ? "annual" : "monthly";
  const status = deleted ? "cancelled" : (STATUS[sub.status] ?? "pending_payment");
  await d.from("cap_table_subscriptions").update({
    status, tier, billing_interval: interval, price_id: priceId ?? null,
    stripe_subscription_id: sub.id, stripe_customer_id: customer,
    current_period_end: periodEnd, cancel_at_period_end: Boolean(sub.cancel_at_period_end), updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (status !== row.status || tier !== row.tier) {
    await d.from("cap_table_subscription_events").insert({ subscription_id: row.id, event_kind: `status_${status}`, detail: { from: row.status, from_tier: row.tier, tier } });
  }
  const { syncClientCapEntitlements } = await import("@/lib/billing.server");
  await syncClientCapEntitlements(d, row.client_id);
}

async function syncWhitelabel(sub: any, env: StripeEnv, deleted: boolean) {
  const clientId = sub.metadata?.clientId;
  if (!clientId) return;
  const d = await db();
  const { data: cur } = await d.from("client_branding").select("whitelabel_status, stripe_subscription_id").eq("client_id", clientId).maybeSingle();
  if (cur?.whitelabel_status === "unlocked_free") return; // free unlock always wins
  if (cur?.stripe_subscription_id && cur.stripe_subscription_id !== sub.id && deleted) return; // stale subscription
  const { periodEnd, customer } = parts(sub);
  const s = deleted ? "cancelled" : (STATUS[sub.status] ?? "pending_payment");
  const whitelabel_status = s === "active" || s === "past_due" ? "active_paid" : s === "pending_payment" ? "payment_pending" : "off";
  await d.from("client_branding").upsert({
    client_id: clientId, whitelabel_status, billing_status: s, billing_environment: env,
    stripe_subscription_id: sub.id, stripe_customer_id: customer, current_period_end: periodEnd,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end), updated_at: new Date().toISOString(),
  }, { onConflict: "client_id" });
  if (cur?.whitelabel_status !== whitelabel_status) {
    await d.from("client_branding_events").insert({ client_id: clientId, event_kind: `whitelabel_${whitelabel_status}`, detail: { billing_status: s } });
  }
}

async function syncFundPayment(session: any, env: StripeEnv, outcome: "paid" | "failed") {
  const id = session.metadata?.paymentId;
  if (!id) return;
  const d = await db();
  const { data: p } = await d.from("fund_payments").select("id, status, environment").eq("id", id).maybeSingle();
  if (!p || p.environment !== env || p.status === "used" || p.status === outcome) return;
  if (outcome === "paid" && p.status === "cancelled") return;
  await d.from("fund_payments").update({
    status: outcome, paid_at: outcome === "paid" ? new Date().toISOString() : null,
    stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", p.id);
  await d.from("fund_payment_events").insert({ payment_id: p.id, event_kind: outcome, detail: { session: session.id } });
}

async function route(sub: any, env: StripeEnv, deleted = false) {
  if (sub.metadata?.kind === "whitelabel") return syncWhitelabel(sub, env, deleted);
  return syncCapSubscription(sub, env, deleted);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") return Response.json({ received: true, ignored: "invalid env" });
        try {
          const event = await verifyWebhook(request, rawEnv);
          switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await route(event.data.object, rawEnv);
              break;
            case "customer.subscription.deleted":
              await route(event.data.object, rawEnv, true);
              break;
            case "checkout.session.completed":
              if (event.data.object.metadata?.kind === "fund_payment" && event.data.object.payment_status !== "unpaid") await syncFundPayment(event.data.object, rawEnv, "paid");
              break;
            case "checkout.session.async_payment_succeeded":
              if (event.data.object.metadata?.kind === "fund_payment") await syncFundPayment(event.data.object, rawEnv, "paid");
              break;
            case "checkout.session.async_payment_failed":
              if (event.data.object.metadata?.kind === "fund_payment") await syncFundPayment(event.data.object, rawEnv, "failed");
              break;
            default:
              break;
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Payments webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
