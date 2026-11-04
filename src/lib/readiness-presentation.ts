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

const done = (items: any[], key: string) => items.some((x) => x.key === key && (x.status === "complete" || x.status === "not_applicable"));

/** Action wording that avoids implying the questionnaire is open when it was already submitted. */
export function actionText(i: any, items: any[] = []): string {
  if (i.key === "tax_classification" && done(items, "subscription_questionnaire")) return "Confirm tax status on the tax form";
  return i.action ?? i.label;
}

/** One short line under a waiting status: why it waits and what is needed. Display only. */
export function waitingDetail(i: any, items: any[] = []): string | null {
  if (!ACTIVE.has(i.status)) return null;
  const qDone = done(items, "subscription_questionnaire");
  const taxDone = done(items, "tax_documentation");
  if (i.status === "under_review" && i.key === "accreditation") return "Accreditation verification awaiting review";
  if (i.status === "under_review") return i.key === "tax_documentation" ? "Uploaded tax form is waiting for review" : `${i.label} is waiting for review`;
  if (i.status === "blocked") return i.reason ?? "An open issue must be resolved first";
  switch (i.key) {
    case "accreditation": return i.status === "needs_harmonious" ? "Accreditation verification awaiting review" : i.action?.startsWith("Update ") ? "Updated accreditation information or proof needed" : "Accreditation information or proof needed";
    case "tax_documentation": return "Investor signs the W-9 or W-8 online, or staff uploads a signed copy";
    case "tax_classification": return qDone ? "Questionnaire is complete. Tax status is confirmed when the W-9 or W-8 is signed" : "Tax status questions in the questionnaire not answered yet";
    case "subscription_questionnaire": return "Questionnaire not submitted yet";
    case "bsa_aml": return qDone ? "Financial background answers still missing in the questionnaire" : "Financial background questions in the questionnaire not answered yet";
    case "certifications": return "Investor confirms the final certifications before signing";
    case "bad_actor": return "Compliance questions in the questionnaire not answered yet";
    case "signature": return "Waiting for investor e-signature, or staff loads an outside signed copy";
    case "signature_docs":
    case "subscription_documents": return taxDone ? "Documents are ready to prepare" : "Prepares automatically once the tax form is signed";
    case "aml": return "Compliance screening has no cleared result yet";
    case "identity_verification": return "Investor has not finished identity verification";
    case "entity_verification": return "Entity documents or verification still needed";
    case "beneficial_owners": return "Owners and signers not listed yet";
    case "investment_amount": return "No investment amount entered";
    case "investment_profile": return "Investor has not chosen who is investing";
    case "account": return "Investor has not created a login yet";
    case "approved_to_fund": return "Fund manager approves the subscription to release wire instructions";
    case "funding": return i.status === "needs_harmonious" ? (i.reason ?? "Incoming wire waiting to be reconciled") : "Waiting for the investor to send funds";
    case "acceptance": return "Funds received; subscription waiting to be accepted";
  }
  if (i.action === "Prepare subscription documents") return taxDone ? "Documents are ready to prepare" : "Prepares automatically once the tax form is signed";
  return i.reason ?? null;
}
