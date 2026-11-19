/**
 * A deposit recorded by hand and the same deposit later arriving on a bank
 * statement or feed must count once. Pure: picks the earlier hand-recorded
 * receipt (same investment, exact same amount) that no bank match has
 * confirmed yet, so the bank match confirms it instead of adding it again.
 */
export type ManualReceiptEvent = { id: string; amountCents: number };
export type BankMatchEvent = { confirmsManualReceiptId: string | null };

export function manualReceiptToConfirm(
  manualReceipts: ManualReceiptEvent[],
  bankMatches: BankMatchEvent[],
  depositCents: number,
): string | null {
  const confirmed = new Set(bankMatches.map((m) => m.confirmsManualReceiptId).filter((x): x is string => Boolean(x)));
  const hit = manualReceipts.find((r) => !confirmed.has(r.id) && r.amountCents === depositCents);
  return hit?.id ?? null;
}
