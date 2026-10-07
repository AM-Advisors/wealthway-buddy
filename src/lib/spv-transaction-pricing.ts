// SPV transaction administration pricing (pure). The single source is the
// spv_transaction_pricing table; this file only interprets rows. It is a
// one-time, raise-based fee and is separate from SPV service-level pricing.

export interface SpvBand { id: string; label: string; min_raise_usd: number; max_raise_usd: number | null; fee_usd: number | null; sort_order: number; }

/** Band for a raise; fee_usd null means custom pricing. */
export function bandForRaise(bands: SpvBand[], raiseUsd: number): SpvBand | null {
  const sorted = [...bands].sort((a, b) => Number(a.min_raise_usd) - Number(b.min_raise_usd));
  return sorted.find((b) => raiseUsd >= Number(b.min_raise_usd) && (b.max_raise_usd == null || raiseUsd < Number(b.max_raise_usd))) ?? null;
}

export const SPV_TXN_KEY_PREFIX = "SPV_TXN:";
export const spvTxnQuoteKey = (bandId: string) => `${SPV_TXN_KEY_PREFIX}${bandId}`;

export type FeeGroup = "one_time" | "annual" | "event";
/** Quote-line grouping: SPV transaction = one-time; admin levels = annual; others by pricing model. */
export function feeGroup(serviceKey: string, pricingModel?: string | null): FeeGroup {
  if (serviceKey.startsWith(SPV_TXN_KEY_PREFIX)) return "one_time";
  if (serviceKey.startsWith("ADMIN:")) return "annual";
  if (pricingModel === "one_time") return "one_time";
  if (pricingModel === "annual" || pricingModel === "recurring" || pricingModel === "monthly") return "annual";
  return "event";
}
export const FEE_GROUP_LABEL: Record<FeeGroup, string> = { one_time: "One-Time Fees", annual: "Annual Recurring Fees", event: "Other / Event-Based Fees" };
