/**
 * One amount rule for every screen that shows an investment's size.
 * Investment amount: accepted (admitted) amount, then the recorded commitment,
 * then the amount the investor asked for. Funded amount: only money the
 * canonical funding status marks reconciled; intended amounts never count.
 */
import { isReconciledFunding } from "@/lib/funding-status";

type AmountRow = {
  accepted_amount_cents?: number | null;
  commitment_amount_cents?: number | null;
  requested_amount_cents?: number | null;
  funded_amount_cents?: number | null;
  funding_status?: string | null;
};

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

export function investmentAmountCents(row: AmountRow): number | null {
  return num(row.accepted_amount_cents) ?? num(row.commitment_amount_cents) ?? num(row.requested_amount_cents);
}

export function reconciledFundedCents(row: AmountRow, fundingStatus: string | null | undefined = row.funding_status): number {
  return isReconciledFunding(fundingStatus) ? Number(row.funded_amount_cents ?? 0) : 0;
}

/** Live investments only: removed or merged duplicates never count in totals or readiness. */
export function isLiveInvestment(row: { removed_at?: string | null; merged_into_onboarding_id?: string | null }): boolean {
  return !row.removed_at && !row.merged_into_onboarding_id;
}
