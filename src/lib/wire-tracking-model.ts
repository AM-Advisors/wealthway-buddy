/**
 * Wire tracking stage for a current investment record (investor_onboardings),
 * from its canonical funding status. Pure and display-only: it never decides
 * that money arrived beyond the shared Funded rule in funding-status.ts.
 */
import { isPendingReconciliation, isReconciledFunding } from "@/lib/funding-status";

export type WireStage = "not_started" | "awaiting_wire" | "submitted" | "processing" | "received" | "problem";

const PROBLEM = new Set(["failed", "returned", "cancelled", "funding_exception", "exception", "overfunded"]);

export function investmentWireStage(o: {
  funding_status?: string | null;
  approved_to_fund_at?: string | null;
  investor_reports_sent_at?: string | null;
}): WireStage {
  const status = String(o.funding_status ?? "");
  if (isReconciledFunding(status)) return "received";
  if (PROBLEM.has(status)) return "problem";
  if (isPendingReconciliation(status)) return "processing";
  if (status === "investor_reports_sent" || o.investor_reports_sent_at) return "submitted";
  if (o.approved_to_fund_at || status === "awaiting_wire" || status === "instructions_released") return "awaiting_wire";
  return "not_started";
}
