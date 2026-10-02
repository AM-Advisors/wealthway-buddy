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

async function syncSubscription(sub: any, env: StripeEnv, deleted = false) {
  const capSubId = sub.metadata?.capSubId;
  if (!capSubId) return;
  const d = await db();
  const { data: row } = await d.from("cap_table_subscriptions").select("id, client_id, tier, status, environment").eq("id", capSubId).maybeSingle();
  if (!row || row.environment !== env) return;
  const item = sub.items?.data?.[0];
  const priceId: string | undefined = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id;
  const tier = priceId?.match(/^cap_table_(\w+?)_(monthly|annual)$/)?.[1] ?? row.tier;
  const interval = priceId?.endsWith("_annual") ? "annual" : "monthly";
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  const status = deleted ? "cancelled" : (STATUS[sub.status] ?? "pending_payment");
  await d.from("cap_table_subscriptions").update({
    status, tier, billing_interval: interval, price_id: priceId ?? null,
    stripe_subscription_id: sub.id, stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end), updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (status !== row.status || tier !== row.tier) {
    await d.from("cap_table_subscription_events").insert({ subscription_id: row.id, event_kind: `status_${status}`, detail: { from: row.status, tier } });
  }
  const { grantCapEntitlement } = await import("@/lib/cap-table-billing.functions");
  if (tier !== row.tier) await grantCapEntitlement(d, row.client_id, row.tier, false);
  await grantCapEntitlement(d, row.client_id, tier, status === "active" || status === "past_due");
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
              await syncSubscription(event.data.object, rawEnv);
              break;
            case "customer.subscription.deleted":
              await syncSubscription(event.data.object, rawEnv, true);
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
