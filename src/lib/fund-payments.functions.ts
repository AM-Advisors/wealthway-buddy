import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const env = z.enum(["sandbox", "live"]);
const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_fund_request"), clientId: z.string().uuid(), request: z.record(z.string(), z.any()) }),
  z.object({ kind: z.literal("service_request"), clientId: z.string().uuid().optional(), answers: z.record(z.string(), z.string()).default({}), serviceKeys: z.array(z.string()).max(100), offeringId: z.string().uuid().nullable().optional() }),
]);
type Target = z.infer<typeof target>;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Works out the client and the a la carte keys on the server - never trusts a client-sent price. */
export async function resolveTarget(context: any, t: Target) {
  const { data: links } = await context.supabase.from("client_users").select("client_id").eq("user_id", context.userId);
  const ids = ((links ?? []) as any[]).map((l) => String(l.client_id));
  const clientId = t.clientId ?? ids[0];
  if (!clientId || !ids.includes(clientId)) throw new Error("You aren't linked to this organisation.");
  const { coreServicesFor } = await import("@/lib/client-portal-model");
  if (t.kind === "new_fund_request") {
    const { autoServices } = await import("@/lib/fund-request-model");
    const r = t.request as any;
    const core = autoServices(r);
    return { clientId, addOnKeys: ((r.service_keys ?? []) as string[]).filter((k) => !core.includes(k)), offeringId: null };
  }
  const core = coreServicesFor(t.answers["vehicle_structure"], t.answers["offering_exemption"], t.answers["jurisdiction"]);
  return { clientId, addOnKeys: t.serviceKeys.filter((k) => !core.includes(k)), offeringId: t.offeringId ?? null };
}

export const quoteFundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => target.parse(d))
  .handler(async ({ data, context }) => {
    const t = await resolveTarget(context, data);
    const { buildQuote } = await import("@/lib/fund-payments.server");
    return buildQuote(await admin(), { clientId: t.clientId, kind: data.kind, addOnKeys: t.addOnKeys, offeringId: t.offeringId });
  });

/** Records the payment and opens embedded card checkout for exactly the quoted items. */
export const startFundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ target, environment: env, returnUrl: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }): Promise<{ paymentId: string; clientSecret: string } | { error: string }> => {
    let t;
    try { t = await resolveTarget(context, data.target); } catch (e) { return { error: (e as Error).message }; }
    const db = await admin();
    const { buildQuote, FUND_SETUP_PRICE_ID } = await import("@/lib/fund-payments.server");
    const q = await buildQuote(db, { clientId: t.clientId, kind: data.target.kind, addOnKeys: t.addOnKeys, offeringId: t.offeringId });
    if (q.totalCents === 0) return { error: "Nothing to pay." };
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient(data.environment);
      const { data: pay, error } = await db.from("fund_payments").insert({
        client_id: t.clientId, kind: data.target.kind, items: q.items, total_cents: q.totalCents,
        environment: data.environment, created_by: context.userId,
      }).select("id").single();
      if (error) return { error: error.message };
      const lines: any[] = [];
      for (const i of q.items.filter((x) => x.cents > 0)) {
        if (i.key === "fund_setup_fee") {
          const prices = await stripe.prices.list({ lookup_keys: [FUND_SETUP_PRICE_ID] });
          if (!prices.data[0]) return { error: "The setup fee price isn't available yet." };
          lines.push({ price: prices.data[0].id, quantity: 1 });
        } else {
          lines.push({ price_data: { currency: "usd", unit_amount: i.cents, product_data: { name: i.name, tax_code: "txcd_10103001" } }, quantity: 1 });
        }
      }
      const { data: { user } } = await context.supabase.auth.getUser();
      const { customerForClient } = await import("@/lib/billing.server");
      const customer = await customerForClient(stripe, t.clientId, user?.email, context.userId);
      const meta = { kind: "fund_payment", paymentId: pay.id, clientId: t.clientId, userId: context.userId };
      const session = await stripe.checkout.sessions.create({
        mode: "payment", ui_mode: "embedded_page", redirect_on_completion: "if_required",
        return_url: data.returnUrl, customer, line_items: lines, metadata: meta,
        payment_intent_data: { description: data.target.kind === "new_fund_request" ? "New fund setup and add-ons" : "A la carte services", metadata: meta },
        managed_payments: { enabled: true },
      } as any);
      await db.from("fund_payments").update({ stripe_session_id: session.id }).eq("id", pay.id);
      await db.from("fund_payment_events").insert({ payment_id: pay.id, event_kind: "checkout_started", actor_id: context.userId, detail: { total_cents: q.totalCents } });
      return { paymentId: pay.id, clientSecret: session.client_secret ?? "" };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

export const getFundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await (context.supabase as any).from("fund_payments").select("id, status, total_cents").eq("id", data.id).maybeSingle();
    return (row ?? null) as { id: string; status: string; total_cents: number } | null;
  });
