/**
 * Shared administration presentation for funds/SPVs and foundations.
 *
 * Display only. Each engine keeps its own stored statuses, authorization, maker-checker
 * and apply rules; this module only maps those recorded statuses onto one familiar set of
 * staff labels. Nothing here decides who may review, approve, sign, bank or pay.
 */
import { canonicalVerificationStatus, identityScreeningSummary } from "@/lib/verification-status";

// ------------------------------------------------------------ Review states

/** One review vocabulary, taken from the existing fund manager submission screen. */
export type ReviewState = "waiting" | "approved" | "needs_changes" | "replaced" | "withdrawn" | "on_file";

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  waiting: "Waiting for Harmonious review",
  approved: "Approved",
  needs_changes: "Needs changes",
  replaced: "Replaced",
  withdrawn: "Withdrawn",
  on_file: "On file",
};

export type Tone = "default" | "secondary" | "outline" | "destructive";
export const REVIEW_STATE_TONE: Record<ReviewState, Tone> = {
  waiting: "secondary", approved: "default", needs_changes: "destructive", replaced: "outline", withdrawn: "outline", on_file: "default",
};

/** Familiar action words, the same on every entity type. */
export const REVIEW_ACTIONS = { apply: "Approve & apply", approve: "Approve", sendBack: "Send back" } as const;

/**
 * Each engine's recorded statuses, mapped without changing them. Fund manager submissions store
 * "withdrawn" when a newer submission supersedes one, so it reads "Replaced"; foundation
 * submissions store "withdrawn" only when the sender withdrew it.
 */
export const REVIEW_ENGINES = {
  fund_manager_submission: { submitted: "waiting", approved: "approved", returned: "needs_changes", withdrawn: "replaced" },
  foundation_submission: { submitted: "waiting", accepted: "approved", correction_requested: "needs_changes", withdrawn: "withdrawn" },
  foundation_document: { pending: "waiting", accepted: "approved", correction_requested: "needs_changes", staff: "on_file" },
} as const satisfies Record<string, Record<string, ReviewState>>;
export type ReviewEngine = keyof typeof REVIEW_ENGINES;

/** Unknown statuses return null so a screen never shows a guessed state. */
export function reviewState(engine: ReviewEngine, status: string | null | undefined): ReviewState | null {
  const map = REVIEW_ENGINES[engine] as Record<string, ReviewState>;
  return status && Object.prototype.hasOwnProperty.call(map, status) ? map[status]! : null;
}

/** Foundation documents: staff uploads are on file; client uploads show their latest review. */
export function foundationDocumentState(d: { source?: string | null; review?: string | null }): ReviewState {
  if (d.source !== "client") return "on_file";
  return reviewState("foundation_document", d.review ?? "pending") ?? "waiting";
}

// ------------------------------------------------------------ Requirement rows

export type RequirementState = "done" | "in_review" | "needed" | "needs_changes" | "exception" | "follow_up";
export type Audience = "staff" | "client";

export const REQUIREMENT_LABEL: Record<RequirementState, string> = {
  done: "Done", in_review: "In review", needed: "Needed", needs_changes: "Needs changes", exception: "Exception", follow_up: "Harmonious will follow up",
};
export const REQUIREMENT_TONE: Record<RequirementState, Tone> = {
  done: "default", in_review: "secondary", needed: "outline", needs_changes: "destructive", exception: "destructive", follow_up: "destructive",
};

export type RequirementRow = { key: string; label: string; state: RequirementState; note?: string | null; source?: string | null; items?: string[] };

/**
 * Clients and fund managers never see the word "exception" or its details, but an unresolved exception
 * is never shown as cleared or as routine review: it reads "Harmonious will follow up" with a note that
 * something is still needed, so a required action isn't hidden.
 */
export function requirementBadge(state: RequirementState, audience: Audience): { label: string; tone: Tone } {
  const s = audience === "client" && state === "exception" ? "follow_up" : state;
  return { label: REQUIREMENT_LABEL[s], tone: REQUIREMENT_TONE[s] };
}

export const FOLLOW_UP_NOTE = "Not resolved yet. Harmonious will contact you about what's needed.";

/** Foundation verification requirement statuses. */
export const fromFoundationRequirement = (s: string): RequirementState =>
  s === "satisfied" ? "done" : s === "in_review" ? "in_review" : s === "exception" ? "exception" : s === "follow_up" ? "follow_up" : "needed";

/** Foundation client checklist statuses. */
export const fromFoundationChecklist = (s: string): RequirementState =>
  s === "done" ? "done" : s === "in_review" ? "in_review" : s === "correction" ? "needs_changes" : "needed";

/**
 * Fund manager setup sections, mirroring the fund setup screen: approved (or bank details already
 * on file) is done, a pending submission is in review, a returned one needs changes.
 */
export function fromFundSetupSection(latestStatus: string | null | undefined, onRecord = false): RequirementState {
  if (latestStatus === "approved") return "done";
  if (latestStatus === "submitted") return "in_review";
  if (latestStatus === "returned") return "needs_changes";
  return onRecord ? "done" : "needed";
}

// ------------------------------------------------------------ People

export type PickKyc = "verified" | "in_progress" | "none";

/**
 * Person-picker badge from the canonical person record only. A sign-in account check never
 * counts here, so the badge cannot suggest a foundation identity requirement is met.
 */
export function personPickState(kyc: string | null | undefined, aml: string | null | undefined): { kyc: PickKyc; detail: string } {
  const k = canonicalVerificationStatus(kyc);
  return { kyc: k === "approved" ? "verified" : k === "review" ? "in_progress" : "none", detail: identityScreeningSummary(kyc, aml).label };
}

// ------------------------------------------------------------ Tasks

/** Staff task status words shared by fund requests and foundation handoffs. */
export const taskStatusLabel = (status: string) =>
  ({ open: "Awaiting review", in_progress: "In progress", blocked: "Blocked", done: "Completed", cancelled: "Canceled" } as Record<string, string>)[status] ?? "Not recorded";
