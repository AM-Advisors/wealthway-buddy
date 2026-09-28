/**
 * Pure presentation helpers for readiness screens. They map the canonical
 * nine-status model to plain wording; they never compute readiness.
 */
import type { ReadinessStatus } from "@/lib/investment-readiness";

export type Viewer = "staff" | "investor" | "manager";
export const ACTIVE = new Set(["needs_investor", "needs_fund_manager", "needs_harmonious", "under_review", "blocked"]);

export function plainStatus(s: ReadinessStatus, viewer: Viewer): string {
  switch (s) {
    case "complete": return "Complete";
    case "needs_investor": return viewer === "investor" ? "Needs your attention" : "Waiting on investor";
    case "needs_fund_manager": return viewer === "manager" ? "Needs your attention" : "Waiting on fund manager";
    case "needs_harmonious": return "Waiting on Harmonious";
    case "under_review": return "Under review";
    case "blocked": return "Blocked";
    case "in_progress": return "In progress";
    case "not_started": return "Not started";
    case "not_applicable": return "Not applicable";
  }
}

export function blockersOf(r: any) {
  return (r?.items ?? []).filter((i: any) => i.required !== false && ACTIVE.has(i.status));
}

export function closeHeadline(r: any) {
  if (r.terminal === "closed") return "Closed";
  if (r.terminal) return r.terminal === "declined" ? "Declined" : "Cancelled";
  return r.closeReady ? "Ready to Close" : "Not Ready to Close";
}

export type Bucket = "all" | "ready" | "needs_investor" | "needs_fund_manager" | "needs_harmonious" | "blocked";
export function bucketOf(row: any): Bucket {
  const r = row.readiness;
  if (row.closeReady || r?.terminal === "closed") return "ready";
  if ((r?.items ?? []).some((i: any) => i.status === "blocked")) return "blocked";
  const o = row.nextAction?.owner;
  if (o === "investor") return "needs_investor";
  if (o === "fund_manager") return "needs_fund_manager";
  if (o === "harmonious") return "needs_harmonious";
  return "all";
}

/** Visual emphasis threshold only. There is no SLA; never call an item overdue. */
export const AGING_DAYS = 3;
export function waitingLabel(days: number) {
  if (days <= 0) return "Waiting since today";
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}
export const isAging = (days: number) => days >= AGING_DAYS;

export const toggleStage = (open: string | null, stage: string) => (open === stage ? null : stage);
