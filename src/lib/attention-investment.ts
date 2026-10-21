import { isReconciledFunding } from "@/lib/funding-status";
/**
 * Where an open investment's Action Center item should point, read from the
 * investment row alone (the page re-derives the full picture server-side).
 */
export type InvestmentRowLite = {
  id: string;
  stage: string | null;
  funding_status?: string | null;
  approved_to_fund_at?: string | null;
  investor_reports_sent_at?: string | null;
};

export function investmentAttentionStep(
  row: InvestmentRowLite,
): { step: "about" | "verify" | "sign" | "fund"; status: string; waiting: boolean } | null {
  const stage = String(row.stage ?? "");
  if (["closed", "declined", "cancelled"].includes(stage)) return null;
  if (isReconciledFunding(row.funding_status)) return null;
  if (row.approved_to_fund_at) {
    const pending =
      Boolean(row.investor_reports_sent_at) ||
      ["bank_transaction_detected", "reconciliation_pending", "partially_funded"].includes(String(row.funding_status));
    return pending
      ? { step: "fund", status: "We're confirming your transfer with the bank.", waiting: true }
      : { step: "fund", status: "Funding instructions are ready. Open Fund to send your investment.", waiting: false };
  }
  if (stage === "harmonious_review") return { step: "sign", status: "Waiting on your fund manager to approve and sign. No action needed from you.", waiting: true };
  if (stage === "signature" || stage === "subscription") return { step: "sign", status: "Documents to review and sign", waiting: false };
  if (["verification", "eligibility", "tax"].includes(stage)) return { step: "verify", status: "Verification to complete", waiting: false };
  return { step: "about", status: "Tell us who is investing", waiting: false };
}
