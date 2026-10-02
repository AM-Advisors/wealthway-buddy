/** Fund payments: $2,500 setup fee for new fund requests + a la carte add-ons at the approved SOW price. */
export const FUND_SETUP_FEE_CENTS = 250000;
export const FUND_SETUP_PRICE_ID = "fund_setup_fee_onetime";

export type PayItem = { key: string; name: string; cents: number; source: "setup_fee" | "sow" | "rate_card" };

/**
 * Prices each a la carte key: approved, current SOW pricing (client_pricing) wins, Fund-specific first,
 * otherwise the rate card. Zero-priced items are listed but not charged.
 */
export async function priceAddOns(db: any, clientId: string, keys: string[], offeringId?: string | null): Promise<PayItem[]> {
  if (!keys.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: cat }, { data: cp }] = await Promise.all([
    db.from("service_catalog").select("key, name, standard_price_cents").in("key", keys),
    db.from("client_pricing").select("service_key, contracted_cents, offering_id, approved_at, superseded_at, expires_on, sow_id")
      .eq("client_id", clientId).in("service_key", keys).is("superseded_at", null).not("approved_at", "is", null),
  ]);
  const live = ((cp ?? []) as any[]).filter((p) => p.contracted_cents != null && (!p.expires_on || p.expires_on >= today));
  return keys.map((key) => {
    const c = ((cat ?? []) as any[]).find((x) => x.key === key);
    const sow = live.find((p) => p.service_key === key && offeringId && p.offering_id === offeringId)
      ?? live.find((p) => p.service_key === key && !p.offering_id);
    return sow
      ? { key, name: c?.name ?? key, cents: Number(sow.contracted_cents), source: "sow" as const }
      : { key, name: c?.name ?? key, cents: Number(c?.standard_price_cents ?? 0), source: "rate_card" as const };
  });
}

export function totalOf(items: PayItem[]) {
  return items.reduce((s, i) => s + i.cents, 0);
}

export async function buildQuote(db: any, args: { clientId: string; kind: "new_fund_request" | "service_request"; addOnKeys: string[]; offeringId?: string | null }) {
  const addOns = await priceAddOns(db, args.clientId, [...new Set(args.addOnKeys)].sort(), args.offeringId);
  const items: PayItem[] = args.kind === "new_fund_request"
    ? [{ key: "fund_setup_fee", name: "New fund setup fee", cents: FUND_SETUP_FEE_CENTS, source: "setup_fee" }, ...addOns]
    : addOns;
  return { items, totalCents: totalOf(items) };
}

const sig = (items: PayItem[]) => items.map((i) => `${i.key}:${i.cents}`).sort().join("|");

/**
 * Called inside the submit handlers: the payment must be paid, unused, for this client and kind,
 * and match exactly what is being submitted now. Marks it used (once).
 */
export async function verifyPayment(db: any, args: { paymentId: string | null | undefined; clientId: string; kind: string; expected: PayItem[]; usedFor: string | null; actorId: string }) {
  if (totalOf(args.expected) === 0) return null;
  if (!args.paymentId) throw new Error("Payment is required before this can be sent to Harmonious.");
  const { data: p } = await db.from("fund_payments").select("*").eq("id", args.paymentId).maybeSingle();
  if (!p || p.client_id !== args.clientId || p.kind !== args.kind) throw new Error("Payment not found.");
  if (p.status !== "paid") throw new Error(p.status === "used" ? "This payment was already used." : "Payment hasn't been confirmed yet.");
  if (sig(p.items) !== sig(args.expected)) throw new Error("Your selected add-ons changed after payment. Please contact Harmonious.");
  return p.id as string;
}

/** Marks a verified payment used once the submission has been created. */
export async function markPaymentUsed(db: any, paymentId: string | null, usedFor: string | null, actorId: string) {
  if (!paymentId) return;
  const p = { id: paymentId };
  const args = { usedFor, actorId };
  const { data: upd } = await db.from("fund_payments").update({ status: "used", used_at: new Date().toISOString(), used_for: args.usedFor, updated_at: new Date().toISOString() })
    .eq("id", p.id).eq("status", "paid").select("id");
  if (!upd?.length) { console.warn("fund payment already used", p.id); return null; }
  await db.from("fund_payment_events").insert({ payment_id: p.id, event_kind: "used", actor_id: args.actorId, detail: { used_for: args.usedFor } });
  return p.id as string;
}

