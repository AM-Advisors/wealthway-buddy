/**
 * Self-serve SaaS orders: click-through SOW under the fixed MSA, card checkout,
 * KYC (account identity gate) + KYB (compliance review), then entitlements.
 * Status/payment change only from the signed webhook; KYB only from a staff decision.
 */
import { accessOpen, entitlementKeys, priceOrder, SAAS_MSA_VERSION, type OrderInterval, type OrderSelection } from "@/lib/saas-order-model";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
const nowIso = () => new Date().toISOString();
const KYB_DECIDERS = ["admin", "super_admin", "compliance"];
const LEGAL_REVIEWERS = ["super_admin", "legal", "executive", "sales_management", "admin"];

async function roles(uid: string): Promise<string[]> {
  const { data } = await (await db()).from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
async function event(orderId: string, actor: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await (await db()).from("saas_order_events").insert({ order_id: orderId, actor_id: actor, event_kind: kind, detail });
}
async function kycOpen(uid: string) {
  const { accountKycStatus } = await import("@/lib/account-kyc.server");
  return (await accountKycStatus(uid)).open;
}

/** Signs the SOW (tick-box MSA acceptance) and creates the client if the signer has none. */
export async function signOrder(uid: string, email: string | null, input: {
  companyName: string; interval: OrderInterval; selection: OrderSelection; signerName: string; signerTitle?: string | undefined; msaAccepted: boolean; ip: string | null;
}) {
  if (!input.msaAccepted) throw new Error("Please tick the box to agree to the MSA and Statement of Work.");
  const priced = priceOrder(input.selection, input.interval);
  if (!priced.lines.length) throw new Error("Pick at least one service.");
  const d = await db();
  const { data: link } = await d.from("client_users").select("client_id, client_role").eq("user_id", uid).is("revoked_at", null).limit(1).maybeSingle();
  let clientId: string | null = link?.client_id ?? null;
  if (link && link.client_role !== "client_gp") throw new Error("Only your organization's general partner can buy a plan.");
  if (!clientId) {
    const { data: c, error } = await d.from("clients").insert({
      name: input.companyName, legal_name: input.companyName, saas_only: true, status: "active", created_by: uid,
      primary_contact_email: email, primary_contact_name: input.signerName, msa_version: SAAS_MSA_VERSION, msa_signed_on: nowIso().slice(0, 10), msa_signer_user_id: uid,
    }).select("id").single();
    if (error) throw new Error("Couldn't create your organization.");
    clientId = c.id;
    await d.from("client_users").insert({ client_id: clientId, user_id: uid, client_role: "client_gp", can_approve: true });
  }
  const { data: order, error } = await d.from("saas_orders").insert({
    client_id: clientId, user_id: uid, company_name: input.companyName, billing_interval: input.interval,
    selection: input.selection, price_snapshot: priced, recurring_cents: priced.recurring * 100, one_time_cents: priced.oneTime * 100,
    msa_version: SAAS_MSA_VERSION, msa_accepted_at: nowIso(), signer_name: input.signerName, signer_title: input.signerTitle ?? null, signed_ip: input.ip,
  }).select("id").single();
  if (error) throw new Error("Couldn't save your agreement.");
  await event(order.id, uid, "sow_signed", { msa_version: SAAS_MSA_VERSION, ip: input.ip, recurring: priced.recurring, one_time: priced.oneTime, interval: input.interval });
  await d.from("contract_audit_events").insert({ actor_id: uid, actor_role: "client", client_id: clientId, area: "saas_order", action: "client signed self-serve SaaS SOW (click-through, fixed MSA)", target: input.companyName, source: "web" });
  return { orderId: order.id as string };
}

async function ownOrder(uid: string, orderId: string) {
  const { data } = await (await db()).from("saas_orders").select("*").eq("id", orderId).eq("user_id", uid).maybeSingle();
  if (!data) throw new Error("Order not found.");
  return data;
}

export async function startOrderCheckout(uid: string, email: string | null, orderId: string, env: "sandbox" | "live", returnUrl: string, method: "card" | "ach" = "card") {
  const o = await ownOrder(uid, orderId);
  if (o.payment_status === "paid") return { clientSecret: null as string | null, paid: true };
  const snap = o.price_snapshot as ReturnType<typeof priceOrder>;
  const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
  try {
    const stripe = createStripeClient(env);
    const { customerForClient } = await import("@/lib/billing.server");
    const customer = await customerForClient(stripe, o.client_id, email, uid);
    const recurring = o.billing_interval === "annual" ? { interval: "year" as const } : { interval: "month" as const, interval_count: 3 };
    const line_items = snap.lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: "usd", unit_amount: l.unit * 100,
        product_data: { name: l.name, tax_code: "txcd_10103001" },
        ...(l.recurring ? { recurring } : {}),
      },
    }));
    if (!snap.lines.some((l) => l.recurring)) return { error: "Plans need at least one yearly or quarterly item." };
    const meta = { kind: "saas_order", orderId: o.id, clientId: o.client_id, userId: uid };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", ui_mode: "embedded_page" as any, return_url: returnUrl, customer,
      line_items: line_items as any, metadata: meta, subscription_data: { metadata: meta },
      // ACH (US bank account) runs through Stripe; the client authorizes the debit in checkout and Stripe confirms settlement.
      ...(method === "ach" ? { payment_method_types: ["us_bank_account"], automatic_tax: { enabled: true } } : { managed_payments: { enabled: true } }),
    } as any);
    await (await db()).from("saas_orders").update({ payment_method: method, stripe_customer_id: customer, environment: env, updated_at: nowIso() }).eq("id", o.id);
    return { clientSecret: session.client_secret ?? "", paid: false };
  } catch (e) {
    return { error: getStripeErrorMessage(e) };
  }
}

const WIRE_CONFIRMERS = ["finance", "admin", "super_admin"];

/** Client chooses to pay by wire. Nothing is charged; Harmonious confirms receipt. */
export async function chooseWire(uid: string, orderId: string) {
  const o = await ownOrder(uid, orderId);
  if (o.payment_status === "paid") return { reference: o.wire_reference as string | null };
  const reference = o.wire_reference ?? `HRM-${String(o.id).slice(0, 8).toUpperCase()}`;
  await (await db()).from("saas_orders").update({ payment_method: "wire", wire_reference: reference, updated_at: nowIso() }).eq("id", o.id);
  await event(o.id, uid, "wire_chosen", { reference });
  return { reference };
}

/** Harmonious staff confirm an incoming wire landed. Record only; no money is moved. */
export async function confirmWireReceived(uid: string, orderId: string, amountCents: number, note: string | null) {
  const r = await roles(uid);
  if (!r.some((x) => WIRE_CONFIRMERS.includes(x))) throw new Error("Only Finance can confirm a wire was received.");
  const d = await db();
  const { data: o } = await d.from("saas_orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) throw new Error("Order not found.");
  if (o.payment_method !== "wire") throw new Error("This order isn't set to pay by wire.");
  if (o.user_id === uid) throw new Error("You can't confirm your own payment.");
  if (o.payment_status === "paid") return { ok: true };
  const due = Number(o.recurring_cents) + Number(o.one_time_cents);
  if (amountCents < due && !note?.trim()) throw new Error("The amount is less than what's due. Add a note to confirm anyway.");
  const end = new Date(); end.setMonth(end.getMonth() + (o.billing_interval === "annual" ? 12 : 3));
  await d.from("saas_orders").update({ payment_status: "paid", wire_received_by: uid, wire_received_at: nowIso(), wire_received_cents: amountCents, wire_note: note, current_period_end: end.toISOString(), updated_at: nowIso() }).eq("id", o.id);
  await event(o.id, uid, "wire_received_confirmed", { amount_cents: amountCents, due_cents: due, note });
  await recompute(o.id);
  return { ok: true };
}

export async function submitKyb(uid: string, orderId: string, k: { legalName: string; ein: string; formationState: string; entityType: string; owners: { name: string; percent: number }[] }) {
  const o = await ownOrder(uid, orderId);
  if (o.kyb_status === "approved") return { ok: true };
  const digits = k.ein.replace(/\D/g, "");
  if (digits.length !== 9) throw new Error("EIN must have 9 digits.");
  const details = { legal_name: k.legalName, ein_last4: digits.slice(-4), formation_state: k.formationState, entity_type: k.entityType, beneficial_owners: k.owners };
  const d = await db();
  await d.from("saas_orders").update({ kyb_status: "review", kyb_details: details, updated_at: nowIso() }).eq("id", o.id);
  await d.from("clients").update({ legal_name: k.legalName, ein_last4: digits.slice(-4), jurisdiction: k.formationState, entity_type: k.entityType }).eq("id", o.client_id);
  await event(o.id, uid, "kyb_submitted", { ein_last4: digits.slice(-4), owners: k.owners.length });
  return { ok: true };
}

/** Recompute access; turns entitlements on (and menu gating) only when every gate passes, off when payment lapses. */
export async function recompute(orderId: string) {
  const d = await db();
  const { data: o } = await d.from("saas_orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) return;
  const open = accessOpen(o, await kycOpen(o.user_id));
  const keys = entitlementKeys(o.selection as OrderSelection);
  const today = nowIso().slice(0, 10);
  if (open && o.status !== "active") {
    for (const key of keys) {
      const { data: ex } = await d.from("service_entitlements").select("id").eq("client_id", o.client_id).is("offering_id", null).eq("service_key", key).maybeSingle();
      const row = { status: "included", pricing_model: "recurring", effective_date: today, termination_date: null, note: `Self-serve SaaS order ${o.id}` };
      if (ex) await d.from("service_entitlements").update(row).eq("id", ex.id);
      else await d.from("service_entitlements").insert({ client_id: o.client_id, service_key: key, ...row });
    }
    await d.from("clients").update({ menu_gating: "entitlements" }).eq("id", o.client_id);
    await d.from("saas_orders").update({ status: "active", activated_at: nowIso(), updated_at: nowIso() }).eq("id", o.id);
    await event(o.id, null, "access_opened", { keys });
  } else if (!open && o.status === "active") {
    await d.from("service_entitlements").update({ status: "not_included", termination_date: today }).eq("client_id", o.client_id).like("note", `Self-serve SaaS order ${o.id}%`);
    await d.from("saas_orders").update({ status: "suspended", updated_at: nowIso() }).eq("id", o.id);
    await event(o.id, null, "access_suspended", { payment_status: o.payment_status, kyb_status: o.kyb_status });
  }
}

/** Webhook-only: payment status for a SaaS order subscription. */
export async function syncOrderPayment(sub: any, deleted: boolean) {
  const orderId = sub.metadata?.orderId;
  if (!orderId) return;
  const s = deleted ? "cancelled" : sub.status === "active" || sub.status === "trialing" ? "paid" : sub.status === "past_due" ? "past_due" : sub.status === "incomplete" ? "unpaid" : "cancelled";
  const item = sub.items?.data?.[0];
  const end = item?.current_period_end ?? sub.current_period_end;
  const d = await db();
  await d.from("saas_orders").update({ payment_status: s, stripe_subscription_id: sub.id, current_period_end: end ? new Date(end * 1000).toISOString() : null, updated_at: nowIso() }).eq("id", orderId);
  await event(orderId, null, `payment_${s}`, { subscription: sub.id });
  await recompute(orderId);
}

export async function mySetup(uid: string) {
  const d = await db();
  const { data: o } = await d.from("saas_orders").select("id, company_name, billing_interval, price_snapshot, payment_status, payment_method, wire_reference, recurring_cents, one_time_cents, kyb_status, kyb_note, status, signed_at, signer_name, msa_version, msa_accepted_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const kyc = await kycOpen(uid);
  if (o && o.status !== "active") await recompute(o.id);
  return { order: o ?? null, kycOpen: kyc };
}

/** Purchased entitlement keys for the caller's client, or null for legacy (ungated) clients. */
export async function myEntitlements(uid: string): Promise<string[] | null> {
  const d = await db();
  const { data: link } = await d.from("client_users").select("client_id").eq("user_id", uid).is("revoked_at", null).limit(1).maybeSingle();
  if (!link) return null;
  const { data: c } = await d.from("clients").select("menu_gating").eq("id", link.client_id).maybeSingle();
  if (c?.menu_gating !== "entitlements") return null;
  const { data: ents } = await d.from("service_entitlements").select("service_key").eq("client_id", link.client_id).eq("status", "included");
  return ((ents ?? []) as any[]).map((e) => String(e.service_key));
}

export async function staffOrders(uid: string) {
  const r = await roles(uid);
  if (!r.some((x) => [...KYB_DECIDERS, ...LEGAL_REVIEWERS, ...WIRE_CONFIRMERS].includes(x))) throw new Error("Staff only.");
  const { data } = await (await db()).from("saas_orders").select("id, client_id, company_name, billing_interval, recurring_cents, one_time_cents, payment_status, kyb_status, kyb_details, kyb_note, status, signer_name, signed_at, msa_version, legal_reviewed_at, environment, user_id, payment_method, wire_reference, wire_received_at, wire_received_cents").order("created_at", { ascending: false }).limit(200);
  return { orders: (data ?? []) as any[], canConfirmWire: r.some((x) => WIRE_CONFIRMERS.includes(x)), me: uid, canDecideKyb: r.some((x) => KYB_DECIDERS.includes(x)), canLegalReview: r.some((x) => LEGAL_REVIEWERS.includes(x)) };
}

export async function decideKyb(uid: string, orderId: string, approve: boolean, note: string | null) {
  const r = await roles(uid);
  if (!r.some((x) => KYB_DECIDERS.includes(x))) throw new Error("Only compliance can decide business checks.");
  const d = await db();
  const { data: o } = await d.from("saas_orders").select("user_id, kyb_status").eq("id", orderId).maybeSingle();
  if (!o) throw new Error("Order not found.");
  if (o.user_id === uid && !r.includes("super_admin")) throw new Error("You can't review your own business check.");
  if (o.user_id === uid && !note?.trim()) throw new Error("A reason is required to approve your own check.");
  if (!approve && !note?.trim()) throw new Error("Please give a reason.");
  await d.from("saas_orders").update({ kyb_status: approve ? "approved" : "declined", kyb_decided_by: uid, kyb_decided_at: nowIso(), kyb_note: note, updated_at: nowIso() }).eq("id", orderId);
  await event(orderId, uid, approve ? "kyb_approved" : "kyb_declined", { note });
  await recompute(orderId);
  return { ok: true };
}

export async function markLegalReviewed(uid: string, orderId: string) {
  const r = await roles(uid);
  if (!r.some((x) => LEGAL_REVIEWERS.includes(x))) throw new Error("Sales or Legal only.");
  const d = await db();
  await d.from("saas_orders").update({ legal_reviewed_by: uid, legal_reviewed_at: nowIso() }).eq("id", orderId);
  await event(orderId, uid, "legal_reviewed");
  return { ok: true };
}
