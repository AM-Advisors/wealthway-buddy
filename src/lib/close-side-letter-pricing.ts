/** Side-letter line in close pricing. Pure: estimates only, never charges anything. */
import { SIDE_LETTER_FEE_CENTS } from "@/lib/side-letter-fee";

export type CloseSideLetterRow = { id: string; onboarding_id: string | null; status: string | null; fee_payment_id: string | null };

const INACTIVE = new Set(["terminated", "withdrawn", "declined", "rejected", "cancelled", "void"]);

export function closeSideLetterPricing(selectedOnboardingIds: string[], letters: CloseSideLetterRow[], paidPaymentIds: Iterable<string>) {
  const selected = new Set(selectedOnboardingIds);
  const paid = new Set(paidPaymentIds);
  const seen = new Set<string>();
  const perInvestor: Record<string, number> = {};
  let count = 0, paidCount = 0;
  const usedPayments = new Set<string>();
  for (const l of letters) {
    if (!l.onboarding_id || !selected.has(l.onboarding_id) || seen.has(l.id)) continue;
    if (INACTIVE.has(String(l.status ?? "").toLowerCase())) continue;
    seen.add(l.id);
    count++;
    perInvestor[l.onboarding_id] = (perInvestor[l.onboarding_id] ?? 0) + 1;
    if (l.fee_payment_id && paid.has(l.fee_payment_id) && !usedPayments.has(l.fee_payment_id)) { usedPayments.add(l.fee_payment_id); paidCount++; }
  }
  const chargeable = count - paidCount;
  return { perInvestor, count, paidCount, chargeable, unitCents: SIDE_LETTER_FEE_CENTS, feeCents: chargeable * SIDE_LETTER_FEE_CENTS };
}
