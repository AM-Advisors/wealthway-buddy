/**
 * The Operations work queue: one shared shape for everything waiting on the
 * Harmonious team.
 *
 * This file holds no state and stores nothing. A work item is a *reading* of a
 * workflow record that already exists — an onboarding stuck in review, a
 * capital call waiting for approval, a bank line nobody has matched. When the
 * underlying record moves, the item disappears on the next read, because there
 * is no second status anywhere to keep in step.
 *
 * Three rules hold throughout:
 *  - a queue item never carries restricted detail (bank numbers, identity
 *    documents, tax identifiers) — only enough to decide whether to open it;
 *  - the capability needed to act is part of the item, and the server drops
 *    items the reader may not see before they ever leave the database;
 *  - priority, due dates and assignment are only ever read from an
 *    authoritative field. Where a workflow has none, we say so rather than
 *    invent one.
 */

import type { OpsAction, OpsArea, OpsCapability } from "@/lib/ops-capabilities";
import { can } from "@/lib/ops-capabilities";
import { isRestrictedField, recordPath, type OpsRecordType } from "@/lib/ops-records";

export const WORK_SECTIONS = [
  "needs_attention",
  "preparation",
  "review",
  "approval",
  "blocked",
  "due_soon",
] as const;
export type WorkSection = (typeof WORK_SECTIONS)[number];

export const WORK_PRIORITIES = ["critical", "high", "normal", "low"] as const;
export type WorkPriority = (typeof WORK_PRIORITIES)[number];

export type WorkItem = {
  /** Stable per source record, so the same item never appears twice. */
  id: string;
  /** Which workflow this reading came from, e.g. "onboarding.review". */
  source: string;
  area: OpsArea;
  recordType: OpsRecordType;
  recordId: string;
  recordTab: string;
  title: string;
  reason: string;
  /** The authoritative state word, exactly as the workflow stores it. */
  workflowState: string;
  requiredAction: OpsAction;
  clientId?: string | null;
  clientName?: string | null;
  fundId?: string | null;
  fundName?: string | null;
  investorUserId?: string | null;
  investorName?: string | null;
  investmentProfileId?: string | null;
  /** Only when the workflow itself records an owner. */
  assignedTo?: string | null;
  assignedToName?: string | null;
  /** Only from a real date column on the workflow record. */
  dueDate?: string | null;
  blocked?: boolean;
  blockReason?: string | null;
  /** When the underlying record last moved; used for neutral ordering. */
  at?: string | null;
  priority: WorkPriority;
};

/** The capability a person must hold to be handed this item at all. */
export function requiredCapability(item: Pick<WorkItem, "area" | "requiredAction">): OpsCapability {
  return `${item.area}:${item.requiredAction}` as OpsCapability;
}

/**
 * Whether this item may be handed to someone. Seeing the area is not enough
 * for an item that asks to be reviewed or approved: they must hold that step.
 */
export function mayReceive(
  item: Pick<WorkItem, "area" | "requiredAction">,
  capabilities: readonly OpsCapability[],
): boolean {
  if (!can(capabilities, item.area, "see")) return false;
  return can(capabilities, item.area, item.requiredAction);
}

export function filterByCapability<T extends Pick<WorkItem, "area" | "requiredAction">>(
  items: readonly T[],
  capabilities: readonly OpsCapability[],
): T[] {
  return items.filter((item) => mayReceive(item, capabilities));
}

/* ------------------------------------------------------------------ priority */

const BLOCKING_AREAS: OpsArea[] = ["capital", "accounting", "onboarding", "regulatory", "reports"];

export const DUE_SOON_DAYS = 7;

const dayMs = 86_400_000;

export function daysUntil(dueDate: string | null | undefined, now: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return null;
  return Math.floor((due - now.getTime()) / dayMs);
}

/**
 * Priority is decided here, on the server, from conditions we can point at.
 * With nothing authoritative to go on the answer is "normal" — a neutral
 * position in the list rather than a guess.
 */
export function priorityFor(
  input: {
    area: OpsArea;
    requiredAction: OpsAction;
    blocked?: boolean | undefined;
    dueDate?: string | null | undefined;
  },
  now: Date = new Date(),
): WorkPriority {
  const days = daysUntil(input.dueDate, now);
  if (days !== null && days < 0) return "critical";
  if (input.blocked && BLOCKING_AREAS.includes(input.area)) return "critical";
  if (input.blocked) return "high";
  if (days !== null && days <= DUE_SOON_DAYS) return "high";
  if (input.requiredAction === "approve" || input.requiredAction === "execute") return "high";
  if (input.requiredAction === "see") return "low";
  return "normal";
}

const PRIORITY_RANK: Record<WorkPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** Highest priority first, then the nearest real deadline, then the oldest. */
export function sortItems<T extends WorkItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rank !== 0) return rank;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    const at = a.at ?? "";
    const bt = b.at ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/* ------------------------------------------------------------------ sections */

export function sectionOf(item: WorkItem, now: Date = new Date()): WorkSection {
  if (item.blocked) return "blocked";
  const days = daysUntil(item.dueDate, now);
  if (days !== null && days <= DUE_SOON_DAYS) return "due_soon";
  if (item.requiredAction === "prepare") return "preparation";
  if (item.requiredAction === "review") return "review";
  if (item.requiredAction === "approve" || item.requiredAction === "execute") return "approval";
  return "needs_attention";
}

export function groupBySection(
  items: readonly WorkItem[],
  now: Date = new Date(),
): Record<WorkSection, WorkItem[]> {
  const out = Object.fromEntries(WORK_SECTIONS.map((s) => [s, [] as WorkItem[]])) as Record<
    WorkSection,
    WorkItem[]
  >;
  for (const item of items) out[sectionOf(item, now)].push(item);
  for (const section of WORK_SECTIONS) out[section] = sortItems(out[section]);
  return out;
}

export const SECTION_TITLES: Record<WorkSection, string> = {
  needs_attention: "Needs attention",
  preparation: "Waiting for preparation",
  review: "Waiting for review",
  approval: "Waiting for approval",
  blocked: "Blocked and exceptions",
  due_soon: "Due soon",
};

export const SECTION_EMPTY: Record<WorkSection, string> = {
  needs_attention: "Nothing is waiting on the team right now.",
  preparation: "Nothing is waiting to be prepared.",
  review: "Nothing is waiting to be reviewed.",
  approval: "Nothing is waiting for approval.",
  blocked: "No blocked items or exceptions.",
  due_soon: `Nothing falls due in the next ${DUE_SOON_DAYS} days.`,
};

/* ------------------------------------------------------------- not yet built */

/**
 * Areas where no authoritative workflow state exists yet. Operations Home says
 * so in words; it never shows a zero that would read as "all clear".
 */
export const UNCONFIGURED_AREAS: { area: string; message: string }[] = [
  { area: "tax", message: "Tax operations workflow has not been configured yet." },
  { area: "regulatory", message: "Regulatory filing workflow has not been configured yet." },
];


export function isUnconfigured(area: string): boolean {
  return UNCONFIGURED_AREAS.some((entry) => entry.area === area);
}

/* -------------------------------------------------------------- destinations */

/** Where the item opens: the exact record and tab where the work is done. */
export function destinationFor(item: Pick<WorkItem, "recordType" | "recordId" | "recordTab">): string {
  return recordPath(item.recordType, item.recordId, item.recordTab);
}

/* ------------------------------------------------------------------- filters */

export type WorkFilters = {
  clientId?: string | undefined;
  fundId?: string | undefined;
  area?: OpsArea | undefined;
  workflowState?: string | undefined;
  assignedTo?: string | undefined;
  /** "mine" limits to the signed-in person's authoritative assignments. */
  scope?: "mine" | "all" | undefined;
  dueBefore?: string | undefined;
  priority?: WorkPriority | undefined;
  blocked?: boolean | undefined;
  section?: WorkSection | undefined;
};

/**
 * Filters narrow; they never widen. Everything here runs after the capability
 * filter, so no filter value can reach an item the reader was not entitled to.
 */
export function applyFilters(
  items: readonly WorkItem[],
  filters: WorkFilters,
  viewerUserId: string,
  now: Date = new Date(),
): WorkItem[] {
  return items.filter((item) => {
    if (filters.clientId && item.clientId !== filters.clientId) return false;
    if (filters.fundId && item.fundId !== filters.fundId) return false;
    if (filters.area && item.area !== filters.area) return false;
    if (filters.workflowState && item.workflowState !== filters.workflowState) return false;
    if (filters.assignedTo && item.assignedTo !== filters.assignedTo) return false;
    if (filters.scope === "mine" && item.assignedTo !== viewerUserId) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.blocked !== undefined && Boolean(item.blocked) !== filters.blocked) return false;
    if (filters.section && sectionOf(item, now) !== filters.section) return false;
    if (filters.dueBefore) {
      if (!item.dueDate) return false;
      if (item.dueDate > filters.dueBefore) return false;
    }
    return true;
  });
}

export function countBy<K extends string>(items: readonly WorkItem[], key: (item: WorkItem) => K) {
  const out = {} as Record<K, number>;
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  return { rows: items.slice(start, start + pageSize), total, page: current, pages };
}

/* ------------------------------------------------------------- safety checks */

const SUMMARY_TEXT_FIELDS = ["title", "reason", "workflowState", "blockReason"] as const;

/**
 * A queue summary must not carry a bank number, an identity document or a tax
 * identifier, however the source record happened to name the column. Used by
 * the collectors and asserted in the tests.
 */
export function summaryIsSafe(item: WorkItem): boolean {
  for (const key of Object.keys(item)) if (isRestrictedField(key)) return false;
  for (const field of SUMMARY_TEXT_FIELDS) {
    const value = item[field];
    if (typeof value !== "string") continue;
    if (/\b\d{6,}\b/.test(value)) return false; // account or reference digits
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(value)) return false; // social security number
  }
  return true;
}

/**
 * Where the queue reads assignment from. Every entry names a real column on an
 * authoritative workflow record; areas missing from this list have no owner
 * field at all, and the queue says "unassigned" rather than pretending.
 */
export const ASSIGNMENT_SOURCES: Record<string, string> = {
  "onboarding.review": "investor_onboardings.assigned_to",
  "onboarding.exception": "investor_onboarding_exceptions.owner",
  "reconciliation.exception": "accounting_exceptions.opened_by",
};

/** Workflows with no owner field anywhere. Reported, not filled in. */
export const ASSIGNMENT_GAPS = [
  "capital calls",
  "expected funding",
  "bank reconciliation review",
  "journal entries",
  "period close",
  "valuations",
  "NAV",
  "allocation runs",
  "financial and performance reporting",
  "investor documents",
];

/** Every due date the queue shows, and the column it came from. */
export const DUE_DATE_SOURCES: Record<string, string> = {
  "capital.call": "capital_calls.due_date",
  "capital.line": "capital_call_lines.due_date",
  "capital.expected": "expected_fundings.expected_by",
  "accounting.period": "accounting_periods.period_end",
  "reports.period": "financial_reports.period_end",
  "onboarding.accreditation": "accreditation_records.expires_at",
  "onboarding.kyc": "kyc_verifications.expired_at",
};
