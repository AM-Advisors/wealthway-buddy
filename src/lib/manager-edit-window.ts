import { canonicalFundingState } from "@/lib/funding-status";

/** Once signing or capital sending starts, details need review. Instructions alone do not close the window. */
export function managerEditWindowOpen(f: { signed: boolean; fundingStatus?: string | null; fundedCents?: number | null; reportedSent?: boolean; stage?: string | null }): boolean {
  const funding = canonicalFundingState({ fundingStatus: f.fundingStatus, investorReportsSent: f.reportedSent });
  return !f.signed && !(Number(f.fundedCents ?? 0) > 0) &&
    !["investor_reports_sent", "pending_reconciliation", "funded", "needs_review"].includes(funding) &&
    !["closed", "declined", "cancelled"].includes(f.stage ?? "");
}