/** Pure rules for cash, cash & shares, and share distributions. No I/O. */

export const DISTRIBUTION_KINDS = ["cash", "cash_and_shares", "shares"] as const;
export type DistributionKind = (typeof DISTRIBUTION_KINDS)[number];
export const DISTRIBUTION_KIND_LABELS: Record<DistributionKind, string> = {
  cash: "Cash",
  cash_and_shares: "Cash & shares",
  shares: "Shares only",
};

/** Standard Harmonious fee for a cash distribution, charged to the fund once per distribution. */
export const CASH_DISTRIBUTION_FEE_CENTS = 250_000;

/** Fee rule: cash is the fixed standard fee (pre-approved); other kinds need an approved custom quote. */
export function distributionFee(kind: DistributionKind, quote?: { harmoniousFeeCents?: number | null | undefined; custodianCostCents?: number | null | undefined }) {
  if (kind === "cash") return { harmoniousFeeCents: CASH_DISTRIBUTION_FEE_CENTS, custodianCostCents: 0, needsApproval: false };
  const h = Math.max(0, Math.round(quote?.harmoniousFeeCents ?? 0));
  const c = Math.max(0, Math.round(quote?.custodianCostCents ?? 0));
  return { harmoniousFeeCents: h, custodianCostCents: c, needsApproval: true };
}

/**
 * Allocate whole shares by weight using largest remainder. Never creates or loses a
 * share: the sum equals totalShares. Ties go to the earlier key for determinism.
 */
export function allocateShares(totalShares: number, weights: { key: string; weight: number }[]) {
  const total = Math.floor(totalShares);
  const sum = weights.reduce((s, w) => s + Math.max(0, w.weight), 0);
  if (total <= 0 || sum <= 0) return { allocations: weights.map((w) => ({ key: w.key, shares: 0 })), unallocated: Math.max(0, total) };
  const raw = weights.map((w, i) => {
    const exact = (Math.max(0, w.weight) / sum) * total;
    return { key: w.key, i, base: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = total - raw.reduce((s, r) => s + r.base, 0);
  const order = [...raw].sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const r of order) { if (left <= 0) break; r.base += 1; left -= 1; }
  return { allocations: raw.map((r) => ({ key: r.key, shares: r.base })), unallocated: left };
}

export function validateSetup(input: { kind: DistributionKind; cashCents?: number | null | undefined; shareCount?: number | null | undefined; sharePriceCents?: number | null | undefined; issuer?: string | null | undefined; custodian?: string | null | undefined }): string[] {
  const p: string[] = [];
  if (input.kind !== "shares" && !(Number(input.cashCents) > 0)) p.push("Enter the cash amount to distribute.");
  if (input.kind !== "cash") {
    if (!(Number(input.shareCount) > 0) || !Number.isInteger(Number(input.shareCount))) p.push("Enter a whole number of shares.");
    if (!(Number(input.sharePriceCents) > 0)) p.push("Enter the value per share.");
    if (!input.issuer?.trim()) p.push("Enter the company issuing the shares.");
    if (!input.custodian?.trim()) p.push("Enter the custodian or transfer agent.");
  }
  return p;
}
