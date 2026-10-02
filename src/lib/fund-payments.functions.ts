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
    const { fundAddOnKeys } = await import("@/lib/fund-request-model");
    return { clientId, addOnKeys: fundAddOnKeys(t.request as any), offeringId: null };
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

/** Wire/ACH: records the payment as awaiting receipt and returns a reference code. Nothing activates until staff confirm receipt. */
export const startOfflineFundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ target, method: z.enum(["wire", "ach"]) }).parse(d))
  .handler(async ({ data, context }): Promise<{ paymentId: string; reference: string; totalCents: number } | { error: string }> => {
    let t;
    try { t = await resolveTarget(context, data.target); } catch (e) { return { error: (e as Error).message }; }
    const db = await admin();
    const { buildQuote } = await import("@/lib/fund-payments.server");
    const q = await buildQuote(db, { clientId: t.clientId, kind: data.target.kind, addOnKeys: t.addOnKeys, offeringId: t.offeringId });
    if (q.totalCents === 0) return { error: "Nothing to pay." };
    const { data: pay, error } = await db.from("fund_payments").insert({
      client_id: t.clientId, kind: data.target.kind, items: q.items, total_cents: q.totalCents,
      environment: "offline", payment_method: data.method, status: "awaiting_payment", created_by: context.userId,
    }).select("id").single();
    if (error) return { error: error.message };
    const reference = `HP-${String(pay.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    await db.from("fund_payment_events").insert({ payment_id: pay.id, event_kind: "offline_started", actor_id: context.userId, detail: { method: data.method, reference, total_cents: q.totalCents } });
    return { paymentId: pay.id as string, reference, totalCents: q.totalCents };
  });

/** Staff: list wire/ACH payments still awaiting receipt. */
export const listOfflineFundPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { whoIsStaff } = await import("@/lib/service-catalog.functions");
    const who = await whoIsStaff(context);
    if (!who.isStaff) throw new Error("Forbidden: this queue is for the Harmonious team.");
    const { data, error } = await (context.supabase as any)
      .from("fund_payments")
      .select("id, client_id, kind, items, total_cents, payment_method, status, used_for, created_at, clients(name, legal_name)")
      .in("payment_method", ["wire", "ach"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((p) => ({
      id: p.id as string,
      clientName: (p.clients?.legal_name ?? p.clients?.name ?? "Client") as string,
      kind: p.kind as string,
      items: (p.items ?? []) as { key: string; name: string; cents: number }[],
      totalCents: p.total_cents as number,
      method: p.payment_method as string,
      status: p.status as string,
      usedFor: (p.used_for as string) ?? null,
      reference: `HP-${String(p.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      createdAt: p.created_at as string,
    }));
  });

/** Staff: confirm a wire/ACH payment arrived. Manual reconciliation only - never automatic. */
export const markFundPaymentReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), note: z.string().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { whoIsStaff } = await import("@/lib/service-catalog.functions");
    const who = await whoIsStaff(context);
    if (!who.isStaff) throw new Error("Forbidden: this queue is for the Harmonious team.");
    const db = await admin();
    const { data: p } = await db.from("fund_payments").select("id, status, payment_method, used_for").eq("id", data.id).maybeSingle();
    if (!p) throw new Error("Payment not found.");
    if (!["wire", "ach"].includes(p.payment_method)) throw new Error("Only wire or ACH payments can be marked received here.");
    const next = p.used_for ? "used" : "paid";
    const { data: upd } = await db.from("fund_payments").update({
      status: next, paid_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", data.id).eq("status", "awaiting_payment").select("id");
    if (!upd?.length) throw new Error("This payment was already confirmed.");
    await db.from("fund_payment_events").insert({ payment_id: data.id, event_kind: "payment_received", actor_id: context.userId, detail: { note: data.note, method: p.payment_method, activated: !!p.used_for } });
    // Receipt email to the person who started the payment. Never blocks the confirmation.
    let receiptSent = false;
    try {
      const { data: full } = await db.from("fund_payments").select("id, kind, total_cents, created_by, clients(name)").eq("id", data.id).maybeSingle();
      if (full?.created_by) {
        const { data: u } = await db.auth.admin.getUserById(full.created_by);
        const email = u?.user?.email;
        if (email) {
          const { data: prof } = await db.from("profiles").select("full_name").eq("id", full.created_by).maybeSingle();
          const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
          const r = await sendTemplateEmail("payment-received", email, {
            idempotencyKey: `payment-received-${full.id}`,
            templateData: {
              name: (prof as any)?.full_name || undefined,
              clientName: (full as any).clients?.name || undefined,
              reference: `HP-${String(full.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`,
              method: p.payment_method === "ach" ? "ACH" : "Wire",
              amount: `$${(full.total_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              receivedDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
              purpose: full.kind === "new_fund_request" ? "New fund request setup fee" : "Service request",
              activated: !!p.used_for,
            },
          });
          receiptSent = !!(r as any)?.sent;
        }
      }
      await db.from("fund_payment_events").insert({ payment_id: data.id, event_kind: receiptSent ? "receipt_sent" : "receipt_not_sent", actor_id: context.userId, detail: {} });
    } catch (e) {
      console.error("payment receipt email failed", e);
      await db.from("fund_payment_events").insert({ payment_id: data.id, event_kind: "receipt_failed", actor_id: context.userId, detail: { error: String((e as Error)?.message ?? e).slice(0, 300) } });
    }
    return { ok: true, receiptSent };
  });

export const getFundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await (context.supabase as any).from("fund_payments").select("id, status, total_cents, environment, stripe_session_id").eq("id", data.id).maybeSingle();
    if (!row) return null;
    // If the confirmation hasn't arrived yet, ask the payment service directly (read-only check of this session).
    if (row.status === "pending" && row.stripe_session_id) {
      try {
        const { createStripeClient } = await import("@/lib/stripe.server");
        const s = await createStripeClient(row.environment).checkout.sessions.retrieve(row.stripe_session_id);
        if (s.status === "complete" && s.payment_status !== "unpaid" && s.metadata?.["paymentId"] === row.id) {
          const db = await admin();
          const { data: upd } = await db.from("fund_payments").update({
            status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
          }).eq("id", row.id).eq("status", "pending").select("id");
          if (upd?.length) await db.from("fund_payment_events").insert({ payment_id: row.id, event_kind: "paid", detail: { session: s.id, via: "status_check" } });
          row.status = "paid";
        }
      } catch (e) {
        console.warn("fund payment status check failed", e);
      }
    }
    return { id: row.id as string, status: row.status as string, total_cents: row.total_cents as number };
  });
