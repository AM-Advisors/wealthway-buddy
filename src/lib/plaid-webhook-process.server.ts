/**
 * Processing of a verified Plaid webhook.
 *
 * Defensive by design: the webhook only tells us *that* something changed for
 * an item. We never trust financial values carried in the delivery — we
 * re-fetch authoritative transactions from Plaid and write those.
 */

type Delivery = {
  itemId: string;
  webhookType: string;
  webhookCode: string;
};

const SYNC_CODES = new Set([
  "INITIAL_UPDATE",
  "HISTORICAL_UPDATE",
  "DEFAULT_UPDATE",
  "SYNC_UPDATES_AVAILABLE",
  "TRANSACTIONS_REMOVED",
]);

export type PlaidProcessResult = {
  status: "processed" | "ignored" | "unknown_item" | "error";
  detail: string;
  offeringId?: string | null;
  added?: number;
  matched?: number;
};

/** Looks up which fund an item belongs to, using the service-role-only RPC. */
async function bankLink(itemId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_bank_link_by_item" as any, {
    p_item_id: itemId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return row as { offering_id: string; access_token: string; created_by: string | null };
}

export async function processPlaidWebhook(delivery: Delivery): Promise<PlaidProcessResult> {
  const { webhookType, webhookCode, itemId } = delivery;

  if (webhookType === "ITEM" && webhookCode === "ERROR") {
    const link = await bankLink(itemId);
    if (!link) return { status: "unknown_item", detail: "No fund is linked to this item." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("bank_accounts")
      .update({ status: "needs_attention" })
      .eq("item_id", itemId);
    return {
      status: "processed",
      detail: "Bank connection flagged as needing attention.",
      offeringId: link.offering_id,
    };
  }

  if (webhookType !== "TRANSACTIONS" || !SYNC_CODES.has(webhookCode)) {
    return { status: "ignored", detail: `No action for ${webhookType}/${webhookCode}.` };
  }

  const link = await bankLink(itemId);
  if (!link) return { status: "unknown_item", detail: "No fund is linked to this item." };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Authoritative state comes from Plaid, never from the webhook payload.
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const { getTransactions } = await import("@/lib/plaid.server");
  const result = await getTransactions(link.access_token, iso(start), iso(end));

  // In Plaid, money arriving in the account is a negative amount.
  const deposits = result.transactions.filter((t) => t.amount < 0 && !t.pending);

  let added = 0;
  for (const t of deposits) {
    const { data: existing } = await supabaseAdmin
      .from("bank_transactions")
      .select("id")
      .eq("offering_id", link.offering_id)
      .eq("plaid_transaction_id", t.transaction_id)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabaseAdmin.from("bank_transactions").insert({
      offering_id: link.offering_id,
      plaid_transaction_id: t.transaction_id,
      posted_on: t.date,
      amount_cents: Math.round(Math.abs(t.amount) * 100),
      name: t.merchant_name || t.name,
      description: t.original_description ?? null,
    });
    if (!error) added += 1;
  }

  await supabaseAdmin
    .from("bank_accounts")
    .update({ last_synced_at: new Date().toISOString(), status: "connected" })
    .eq("item_id", itemId);

  let matched = 0;
  if (link.created_by) {
    const { runAutoMatch } = await import("@/lib/bank-auto-match.server");
    const auto = await runAutoMatch(
      supabaseAdmin,
      link.created_by,
      link.offering_id,
      "bank feed webhook",
    );
    matched = auto.total;
  }

  return {
    status: "processed",
    detail: `${added} new deposit(s); ${matched} matched automatically.`,
    offeringId: link.offering_id,
    added,
    matched,
  };
}
