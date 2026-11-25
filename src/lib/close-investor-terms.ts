import { investorFeeSummary } from "./investor-economics-model";
import { expiryStatus } from "./side-letter-model";

export type CloseLetter = Parameters<typeof investorFeeSummary>[1][number] & {
  current_version?: number; document_reference?: string | null;
};
export function closeInvestorTerms(fundId: string, onboardingId: string, letters: CloseLetter[], today = new Date()) {
  const mine = letters.filter(l => l.offering_id === fundId && l.onboarding_id === onboardingId);
  const summaries = mine.map(l => ({
    id: l.id, version: l.current_version ?? null, status: l.status,
    applicable: l.status === "active" && ["active", "expiring"].includes(expiryStatus({ effectiveDate: l.effective_date, expiryDate: l.expiry_date }, today)),
    reference: l.document_reference ?? null,
    terms: Array.isArray(l.terms) ? l.terms.filter((t): t is { category: string; description?: string; value?: string; applicability?: string } => !!t && typeof t === "object" && typeof t.category === "string") : [],
  }));
  try {
    const resolved = investorFeeSummary({ fee: null, carry: null }, mine, { offeringId: fundId, onboardingId }, today);
    return { feeOverride: resolved.fee, carryOverride: resolved.carry, letters: summaries, error: null as string | null };
  } catch (e) {
    return { feeOverride: null, carryOverride: null, letters: summaries, error: e instanceof Error ? e.message : "Side-letter terms need review." };
  }
}
export function closeManagementFee(rows: { amountCents: number | null; terms: ReturnType<typeof closeInvestorTerms> }[], defaultPct: number | null) {
  let total = 0;
  for (const row of rows) {
    const rate = row.terms.feeOverride ?? defaultPct;
    if (row.terms.error || rate == null || row.amountCents == null) return null;
    total += Math.round(row.amountCents * rate / 100);
  }
  return total;
}