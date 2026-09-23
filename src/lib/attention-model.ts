/**
 * The Action Center model: one shared shape for "what needs your attention".
 *
 * Nothing here is stored. An attention item is a *reading* of a workflow record
 * that already exists — an identity check waiting on the investor, a capital
 * call Harmonious is preparing, a signature sitting with a counterparty. When
 * the underlying record moves, the item changes on the next read, because there
 * is no second status kept anywhere.
 *
 * Three rules hold throughout:
 *  - an item never carries restricted detail (bank numbers, identity documents,
 *    tax identifiers) — only enough to decide whether to open it;
 *  - a due date appears only when a real date column on the authoritative
 *    record supplied it; there are no invented deadlines;
 *  - the wording is a presentation mapping over the authoritative state. The
 *    stored state word is carried alongside and never replaced.
 */

import { isRestrictedField } from "@/lib/ops-records";
import type { WorkspaceKind } from "@/lib/session-resolution";

export const ATTENTION_GROUPS = [
  "needs_you",
  "harmonious_working",
  "waiting_third_party",
  "recently_completed",
] as const;
export type AttentionGroup = (typeof ATTENTION_GROUPS)[number];

export const GROUP_TITLES: Record<AttentionGroup, string> = {
  needs_you: "Needs you",
  harmonious_working: "Harmonious is working",
  waiting_third_party: "Waiting on someone else",
  recently_completed: "Recently completed",
};

export const GROUP_EMPTY: Record<AttentionGroup, string> = {
  needs_you: "Nothing is waiting on you right now.",
  harmonious_working: "Harmonious has nothing in progress for you at the moment.",
  waiting_third_party: "Nothing is waiting on anyone else.",
  recently_completed: "Nothing has completed recently.",
};

export const ATTENTION_SEVERITIES = ["critical", "action", "info"] as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITIES)[number];

export type AttentionItem = {
  /** Stable per source record, so the same item never appears twice. */
  id: string;
  /** Which workflow this reading came from, e.g. "investor.identity". */
  source: string;
  workspace: WorkspaceKind;
  group: AttentionGroup;
  severity: AttentionSeverity;
  title: string;
  /** Plain-English sentence for the reader. Presentation only. */
  status: string;
  /** The authoritative state word, exactly as the workflow stores it. */
  workflowState: string;
  /** The table the reading came from, named so the source is always traceable. */
  sourceTable: string;
  sourceId: string;
  /** Where the work is actually done. Always an internal path. */
  href: string;
  /** Only from a real date column; null when the workflow has none. */
  dueDate: string | null;
  /** The column a due date came from, or null when there is no due date. */
  dueDateSource: string | null;
  /** When the underlying record last moved; used for neutral ordering. */
  at: string | null;
  fundName?: string | null;
  clientName?: string | null;
  /** Set only for professional readers, so delegations never blend together. */
  delegationId?: string | null;
  onBehalfOf?: string | null;
};

/**
 * A capability area we cannot speak to yet. Shown in words rather than as a
 * zero, which would read as "all clear".
 */
export type AttentionGap = { area: string; message: string };

export type AttentionResult = {
  workspace: WorkspaceKind;
  groups: Record<AttentionGroup, AttentionItem[]>;
  gaps: AttentionGap[];
  generatedAt: string;
};

/* ------------------------------------------------------------- status words */

/**
 * Presentation mapping from stored workflow states to client-friendly wording.
 * This never replaces a stored value; anything unmapped falls back to the
 * state word itself, tidied, so an unknown state is visible rather than hidden.
 */
const STATUS_WORDS: Record<string, string> = {
  // identity and eligibility
  kyc_pending: "Harmonious is reviewing your identity verification",
  kyc_required: "Identity verification needed",
  kyc_review: "Harmonious is reviewing your identity verification",
  kyc_expired: "Your identification has expired and needs replacing",
  aml_pending: "Harmonious is completing screening",
  accreditation_required: "Accreditation evidence needed",
  accreditation_pending: "Harmonious is reviewing your accreditation",
  proof_required: "Proof of address needed",
  proof_pending: "Harmonious is checking your proof of address",
  review_required: "Harmonious needs to take another look",
  // agreements
  out_for_signature: "Ready for you to sign",
  sent: "Sent for signature",
  pending: "Waiting to be signed",
  declined: "Signing was declined",
  signed: "Signed",
  completed: "Complete",
  // capital and cash
  published: "Payment instructions issued",
  awaiting_wire: "Waiting for your transfer",
  processing: "Transfer detected — Harmonious is confirming it",
  settled: "Funds received and recorded",
  auto_matched: "Transfer detected — Harmonious is confirming it",
  harmonious_reviewed: "Harmonious is confirming your transfer",
  reconciled: "Transfer confirmed and recorded",
  // accounting, valuation, reporting
  draft: "Harmonious is preparing this",
  in_progress: "Harmonious is working on this",
  review: "Harmonious is reviewing this",
  approved: "Approved",
  effective: "Approved",
  open: "Harmonious is working on this period",
  closed: "Period closed",
  not_started: "Not started yet",
};

export function plainStatus(workflowState: string, fallback?: string): string {
  const key = String(workflowState ?? "").toLowerCase();
  const mapped = STATUS_WORDS[key];
  if (mapped) return mapped;
  if (fallback) return fallback;
  if (!key) return "Status not available";
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** True when no authoritative wording exists — used by tests and the gap list. */
export function hasPlainStatus(workflowState: string): boolean {
  return Boolean(STATUS_WORDS[String(workflowState ?? "").toLowerCase()]);
}

/* ------------------------------------------------------------------ building */

export type AttentionInput = Omit<AttentionItem, "dueDate" | "dueDateSource" | "status"> & {
  status?: string;
  dueDate?: string | null;
  /** Required whenever a due date is supplied. No source, no date. */
  dueDateSource?: string | null;
};

/**
 * Builds an item with the safety rules applied in one place, so no collector
 * can forget them: a due date survives only with a named source column, and the
 * wording always falls back to the stored state.
 */
export function buildAttentionItem(input: AttentionInput): AttentionItem {
  const hasSource = Boolean(input.dueDateSource);
  return {
    ...input,
    status: input.status ?? plainStatus(input.workflowState),
    dueDate: hasSource ? (input.dueDate ?? null) : null,
    dueDateSource: hasSource ? (input.dueDateSource ?? null) : null,
  };
}

/* ------------------------------------------------------------------ ordering */

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, action: 1, info: 2 };

export function sortAttention<T extends AttentionItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    const at = a.at ?? "";
    const bt = b.at ?? "";
    if (at !== bt) return at > bt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

export function emptyGroups(): Record<AttentionGroup, AttentionItem[]> {
  return Object.fromEntries(ATTENTION_GROUPS.map((g) => [g, [] as AttentionItem[]])) as Record<
    AttentionGroup,
    AttentionItem[]
  >;
}

export function groupAttention(items: readonly AttentionItem[]): Record<AttentionGroup, AttentionItem[]> {
  const out = emptyGroups();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out[item.group].push(item);
  }
  for (const group of ATTENTION_GROUPS) out[group] = sortAttention(out[group]);
  return out;
}

/* ------------------------------------------------------------- safety checks */

const TEXT_FIELDS = ["title", "status", "workflowState", "onBehalfOf"] as const;

/**
 * An attention item must not carry a bank number, an identity document or a
 * tax identifier, however the source record happened to name the column, and
 * must never link outside the application.
 */
export function attentionIsSafe(item: AttentionItem): boolean {
  for (const key of Object.keys(item)) if (isRestrictedField(key)) return false;
  for (const field of TEXT_FIELDS) {
    const value = item[field];
    if (typeof value !== "string") continue;
    if (/\b\d{6,}\b/.test(value)) return false; // account or reference digits
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(value)) return false; // social security number
  }
  if (!item.href.startsWith("/") || item.href.startsWith("//")) return false;
  return true;
}

/** Applied by the server before anything leaves it. */
export function safeItems(items: readonly AttentionItem[]): AttentionItem[] {
  return items.filter(attentionIsSafe);
}

/* --------------------------------------------------------------- known gaps */

/** Areas with no authoritative workflow state to read yet. Said in words. */
export const ATTENTION_GAPS: Record<string, AttentionGap> = {
  tax_operations: {
    area: "Tax",
    message: "Tax operations workflow has not been configured yet.",
  },
  regulatory: {
    area: "Regulatory",
    message: "Regulatory filing workflow has not been configured yet.",
  },
};

/** Every due date the Action Center may show, and the column it comes from. */
export const DUE_DATE_SOURCES: Record<string, string> = {
  "capital.line": "capital_call_lines.due_date",
  "capital.call": "capital_calls.due_date",
  "capital.expected": "expected_fundings.expected_by",
  "identity.expiry": "kyc_verifications.document_expiration_date",
  "accreditation.expiry": "accreditation_records.expires_at",
  "accounting.period": "accounting_periods.period_end",
  "reports.period": "financial_reports.period_end",
};
