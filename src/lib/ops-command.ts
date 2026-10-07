// Operations Command Center — pure rules (prioritization, SLA status, capacity,
// service limits, package identity, investor exceptions). Server code only
// gathers source rows; every judgement lives here so it is unit-tested.

import { ladderLevel } from "@/lib/service-ladders";

/* ---------------- Package identity ---------------- */

const SHORT: Record<string, string> = {
  "SPV_ADMINISTRATION/CORE": "SPV · Core", "SPV_ADMINISTRATION/PLUS": "SPV · Plus", "SPV_ADMINISTRATION/WHITE_GLOVE": "SPV · White Glove",
  "FUND_ADMINISTRATION/CORE": "Fund · Core", "FUND_ADMINISTRATION/FUND_ADMINISTRATION": "Fund · Administration",
  "FUND_ADMINISTRATION/WHITE_GLOVE": "Fund · White Glove", "FUND_ADMINISTRATION/INSTITUTIONAL": "Fund · Institutional",
};
export const PACKAGE_KEYS = Object.keys(SHORT);
/** Always product-qualified, e.g. "SPV · Core"; never a bare level. */
export function packageLabel(product?: string | null, level?: string | null): string {
  if (!product || !level) return "No engagement";
  return SHORT[`${product}/${level}`] ?? `${ladderLevel(product, level)?.name ?? product.replace(/_/g, " ")} · ${level.replace(/_/g, " ")}`;
}

/* ---------------- SLA status ---------------- */

export type SlaStatus = "HEALTHY" | "APPROACHING" | "AT_RISK" | "BREACHED" | "PAUSED" | "NOT_CONFIGURED" | "RESPONDED";
export const SLA_STATUS_LABEL: Record<SlaStatus, string> = {
  HEALTHY: "Healthy", APPROACHING: "Approaching", AT_RISK: "At Risk", BREACHED: "Breached", PAUSED: "Paused", NOT_CONFIGURED: "Custom / Not Configured", RESPONDED: "Responded",
};

export interface SlaInput {
  sla_hours: number | null; submitted_at: string | null; sla_due_at: string | null;
  sla_paused_at: string | null; sla_paused_minutes: number | null; first_response_at: string | null;
}
export interface SlaComputed { status: SlaStatus; elapsedMinutes: number; pausedMinutes: number; remainingMinutes: number | null; dueAt: string | null; pctElapsed: number | null; }

/**
 * Warning percentage comes from the SLA policy (default 75% elapsed = At Risk).
 * "Approaching" starts at two-thirds of the warning point. Paused time never counts.
 */
export function computeSla(r: SlaInput, warningPct = 75, now = Date.now()): SlaComputed {
  const pausedNow = r.sla_paused_at ? Math.max(0, Math.round((now - Date.parse(r.sla_paused_at)) / 60000)) : 0;
  const pausedMinutes = Number(r.sla_paused_minutes ?? 0) + pausedNow;
  const started = r.submitted_at ? Date.parse(r.submitted_at) : null;
  const end = r.first_response_at ? Date.parse(r.first_response_at) : now;
  const elapsedMinutes = started == null ? 0 : Math.max(0, Math.round((end - started) / 60000) - pausedMinutes);
  if (r.sla_hours == null || !r.sla_due_at) return { status: "NOT_CONFIGURED", elapsedMinutes, pausedMinutes, remainingMinutes: null, dueAt: null, pctElapsed: null };
  const totalMin = Number(r.sla_hours) * 60;
  const dueAt = new Date(Date.parse(r.sla_due_at) + pausedMinutes * 60000).toISOString();
  const remainingMinutes = Math.round(totalMin - elapsedMinutes);
  const pctElapsed = totalMin > 0 ? Math.round((elapsedMinutes / totalMin) * 100) : 100;
  if (r.first_response_at) return { status: pctElapsed > 100 ? "BREACHED" : "RESPONDED", elapsedMinutes, pausedMinutes, remainingMinutes, dueAt, pctElapsed };
  if (r.sla_paused_at) return { status: "PAUSED", elapsedMinutes, pausedMinutes, remainingMinutes, dueAt, pctElapsed };
  const status: SlaStatus = remainingMinutes < 0 ? "BREACHED" : pctElapsed >= warningPct ? "AT_RISK" : pctElapsed >= Math.round(warningPct * (2 / 3)) ? "APPROACHING" : "HEALTHY";
  return { status, elapsedMinutes, pausedMinutes, remainingMinutes, dueAt, pctElapsed };
}

/* ---------------- Unified work item + priority ---------------- */

export type WorkKind = "task" | "request" | "approval" | "calendar" | "exception" | "capital" | "review";
export type Responsibility = "HARMONIOUS_HANDLING" | "CLIENT_APPROVAL_REQUIRED" | "CLIENT_INFORMATION_REQUIRED" | "WAITING_ON_INVESTOR" | "WAITING_ON_THIRD_PARTY" | "COMPLETED";

export interface WorkItem {
  kind: WorkKind; id: string; title: string; href: string;
  fundId: string | null; fundName: string | null; clientName: string | null; packageLabel: string; product: string | null; level: string | null;
  due: string | null; priority: "low" | "normal" | "high" | "urgent"; responsibility: Responsibility;
  assignedUserId: string | null; assignedName: string | null; team: string | null;
  category: string | null; highRisk: boolean; sla: SlaStatus | null; severity?: "low" | "medium" | "high" | "critical";
  waitingSince?: string | null; waitingOnName?: string | null; waitingOnType?: string | null; status?: string; amount?: number | null;
  rank: number; reason: string;
}

const FINANCIAL = new Set(["capital", "distribution", "accounting", "nav", "tax", "regulatory", "compliance", "banking", "CAPITAL", "ACCOUNTING", "NAV", "TAX", "REGULATORY", "BANKING", "AUDIT"]);

/** Rank 1 (most urgent) … 13 (no signal). Order per the Operations brief; creation date is never a factor. */
export function rankItem(i: Omit<WorkItem, "rank" | "reason">, today: string): { rank: number; reason: string } {
  const overdue = !!i.due && i.due < today && i.responsibility !== "COMPLETED";
  const soon = !!i.due && i.due >= today && i.due <= addDays(today, 7);
  const fin = (i.category && FINANCIAL.has(i.category)) || i.kind === "capital";
  if (overdue && fin && (i.priority === "urgent" || i.priority === "high" || i.severity === "critical")) return { rank: 1, reason: "Critical overdue financial/compliance item" };
  if (i.sla === "BREACHED") return { rank: 2, reason: "SLA breached" };
  if (i.highRisk && i.responsibility === "HARMONIOUS_HANDLING") return { rank: 3, reason: "High-risk financial action awaiting Harmonious" };
  if (i.sla === "AT_RISK") return { rank: 4, reason: "SLA at risk" };
  if (overdue && i.responsibility === "CLIENT_APPROVAL_REQUIRED") return { rank: 5, reason: "Client approval overdue" };
  if (overdue && i.responsibility === "CLIENT_INFORMATION_REQUIRED") return { rank: 6, reason: "Client information overdue" };
  if (i.responsibility === "WAITING_ON_INVESTOR" && (overdue || i.kind === "exception")) return { rank: 7, reason: "Investor funding/KYC blocker" };
  if ((overdue || soon) && (i.category === "REPORTING" || i.category === "reporting" || i.category === "NAV")) return { rank: 8, reason: "Reporting deadline at risk" };
  if ((overdue || soon) && (i.category === "TAX" || i.category === "REGULATORY" || i.category === "tax" || i.category === "regulatory")) return { rank: 9, reason: "Tax/regulatory deadline at risk" };
  if (overdue && (i.priority === "high" || i.priority === "urgent")) return { rank: 10, reason: "High-priority overdue" };
  if (overdue) return { rank: 11, reason: "Overdue" };
  if (soon && (i.priority === "high" || i.priority === "urgent")) return { rank: 12, reason: "Upcoming high-priority deadline" };
  return { rank: 13, reason: !i.assignedUserId && !i.team ? "Unassigned" : "Open" };
}

export function prioritize(items: Omit<WorkItem, "rank" | "reason">[], today: string): WorkItem[] {
  return items.map((i) => ({ ...i, ...rankItem(i, today) }))
    .sort((a, b) => a.rank - b.rank || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title));
}

export function addDays(d: string, n: number) {
  const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}
export function daysBetween(from: string | null | undefined, to: string) {
  if (!from) return null; return Math.max(0, Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) / 86_400_000));
}

/* ---------------- Capacity ---------------- */

export type CapacityStatus = "NORMAL" | "ELEVATED" | "HIGH" | "OVER_CAPACITY";
export const CAPACITY_LABEL: Record<CapacityStatus, string> = { NORMAL: "Normal", ELEVATED: "Elevated", HIGH: "High", OVER_CAPACITY: "Over Capacity" };
export interface CapacityThresholds { expected_load: number; elevated_pct: number; high_pct: number; over_pct: number; }
export const DEFAULT_WEIGHTS: Record<string, number> = { "SPV_ADMINISTRATION/CORE": 0.25, "SPV_ADMINISTRATION/PLUS": 0.5, "SPV_ADMINISTRATION/WHITE_GLOVE": 1, "FUND_ADMINISTRATION/CORE": 0.75, "FUND_ADMINISTRATION/FUND_ADMINISTRATION": 1, "FUND_ADMINISTRATION/WHITE_GLOVE": 1.75, "FUND_ADMINISTRATION/INSTITUTIONAL": 3 };

export const weightFor = (weights: Record<string, number>, product: string, level: string) => Number(weights[`${product}/${level}`] ?? 1);

/** Weighted engagements plus open work pressure; overdue and SLA risk weigh more than fund count. */
export function capacityLoad(x: { weightedEngagements: number; openTasks: number; overdue: number; slaAtRisk: number; slaBreached: number }) {
  return Math.round((x.weightedEngagements + x.openTasks * 0.05 + x.overdue * 0.15 + x.slaAtRisk * 0.25 + x.slaBreached * 0.5) * 100) / 100;
}
export function capacityStatus(load: number, t: CapacityThresholds): CapacityStatus {
  const pct = t.expected_load > 0 ? (load / t.expected_load) * 100 : 0;
  return pct >= t.over_pct ? "OVER_CAPACITY" : pct >= t.high_pct ? "HIGH" : pct >= t.elevated_pct ? "ELEVATED" : "NORMAL";
}

/* ---------------- Service limits ---------------- */

export type LimitStatus = "OK" | "APPROACHING" | "REVIEW_REQUIRED" | "NO_LIMIT";
export function limitStatus(used: number, included: number | null | undefined, t = { approaching_pct: 80, review_pct: 100 }): { status: LimitStatus; pct: number | null } {
  if (included == null || included <= 0) return { status: "NO_LIMIT", pct: null };
  const pct = Math.round((used / included) * 100);
  return { status: pct >= t.review_pct ? "REVIEW_REQUIRED" : pct >= t.approaching_pct ? "APPROACHING" : "OK", pct };
}

/* ---------------- Investor exceptions (from readiness tasks) ---------------- */

export const INVESTOR_EXCEPTION_FOR: Record<string, string> = {
  identity_verification: "KYC Incomplete", aml: "KYC Incomplete", bsa_aml: "KYC Incomplete",
  entity_verification: "KYB Incomplete", beneficial_owners: "KYB Incomplete",
  accreditation: "Accreditation Incomplete", eligibility: "Accreditation Incomplete",
  subscription_documents: "Subscription Unsigned", signature: "Subscription Unsigned", subscription_questionnaire: "Subscription Unsigned", certifications: "Subscription Unsigned",
  funding: "Funding Outstanding", tax_documentation: "Tax Document Missing", tax_classification: "Tax Document Missing",
};
export function investorExceptionType(requirementKey: string) { return INVESTOR_EXCEPTION_FOR[requirementKey] ?? "Other"; }
export function investorSeverity(type: string, ageDays: number): "low" | "medium" | "high" {
  if (type === "Funding Outstanding" || type === "KYC Incomplete") return ageDays > 14 ? "high" : "medium";
  return ageDays > 30 ? "medium" : "low";
}

/* ---------------- Third parties ---------------- */
export const THIRD_PARTY_TYPES = ["Auditor", "Attorney", "Bank", "Tax Preparer", "Custodian", "Transfer Agent", "Issuer", "Valuation Provider", "Registered Agent", "Other"];
export function thirdPartyType(raw?: string | null) {
  if (!raw) return "Other";
  const k = raw.toLowerCase().replace(/[_-]/g, " ");
  return THIRD_PARTY_TYPES.find((t) => t.toLowerCase() === k) ?? "Other";
}

/* ---------------- Bulk safety ---------------- */
export const SAFE_BULK_ACTIONS = ["assign", "team", "priority", "follow_up", "acknowledge"] as const;
export type BulkAction = (typeof SAFE_BULK_ACTIONS)[number];
/** Bulk actions only touch tasks and exceptions — never approvals, payments, NAV, pricing or banking. */
export function bulkAllowed(action: string, kind: string) {
  return (SAFE_BULK_ACTIONS as readonly string[]).includes(action) && (action === "acknowledge" ? kind === "exception" : kind === "task");
}

/* ---------------- Reporting status ---------------- */
export const REPORT_STATUSES = ["SCHEDULED", "PREPARING", "INTERNAL_REVIEW", "CLIENT_REVIEW", "FINAL", "RELEASED"] as const;
export function reportStatus(item: { report_status: string | null; status: string; due_date: string }, today: string) {
  const s = (item.report_status ?? "SCHEDULED").toUpperCase();
  if (s !== "RELEASED" && s !== "FINAL" && item.status !== "COMPLETED" && item.due_date < today) return "OVERDUE";
  return s;
}
