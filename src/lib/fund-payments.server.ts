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

/** Offline methods: the request can be sent, but nothing is activated until Harmonious confirms receipt. */
export const OFFLINE_METHODS = ["wire", "ach"] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];

/**
 * Called inside the submit handlers: the payment must be unused, for this client and kind,
 * and match exactly what is being submitted now. Card payments must be paid; wire/ACH may
 * still be awaiting receipt - the submission is flagged so nothing activates until staff
 * confirm the money arrived.
 */
export async function verifyPayment(db: any, args: { paymentId: string | null | undefined; clientId: string; kind: string; expected: PayItem[]; usedFor: string | null; actorId: string }) {
  if (totalOf(args.expected) === 0) return null;
  if (!args.paymentId) throw new Error("Payment is required before this can be sent to Harmonious.");
  const { data: p } = await db.from("fund_payments").select("*").eq("id", args.paymentId).maybeSingle();
  if (!p || p.client_id !== args.clientId || p.kind !== args.kind) throw new Error("Payment not found.");
  const offline = OFFLINE_METHODS.includes(p.payment_method);
  const awaiting = offline && p.status === "awaiting_payment";
  if (p.status !== "paid" && !awaiting) throw new Error(p.status === "used" ? "This payment was already used." : "Payment hasn't been confirmed yet.");
  if (sig(p.items) !== sig(args.expected)) throw new Error("Your selected add-ons changed after payment. Please contact Harmonious.");
  return { id: p.id as string, awaiting };
}

/** Marks a verified payment used once the submission has been created. Awaiting wire/ACH stays awaiting. */
export async function markPaymentUsed(db: any, paymentId: string | null, usedFor: string | null, actorId: string) {
  if (!paymentId) return;
  const { data: row } = await db.from("fund_payments").select("id, status").eq("id", paymentId).maybeSingle();
  if (!row || (row.status !== "paid" && row.status !== "awaiting_payment")) { console.warn("fund payment already used", paymentId); return null; }
  const next = row.status === "awaiting_payment" ? "awaiting_payment" : "used";
  const { data: upd } = await db.from("fund_payments").update({ status: next, used_at: new Date().toISOString(), used_for: usedFor, updated_at: new Date().toISOString() })
    .eq("id", paymentId).eq("status", row.status).select("id");
  if (!upd?.length) { console.warn("fund payment already used", paymentId); return null; }
  await db.from("fund_payment_events").insert({ payment_id: paymentId, event_kind: "used", actor_id: actorId, detail: { used_for: usedFor, awaiting_receipt: next === "awaiting_payment" } });
  return paymentId;
}

