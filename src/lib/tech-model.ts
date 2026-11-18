/**
 * Tech workspace rules (pure, browser-safe): who triages, report statuses, roadmap columns,
 * caught-error grouping. Reporters only ever see their own reports.
 */
import { sensitiveTextProblem } from "@/lib/software-issue-model";

export const TECH_MANAGER_ROLES = ["super_admin", "product_reviewer", "tech_team"] as const;
export const canManageTech = (roles: readonly string[]) => roles.some((r) => (TECH_MANAGER_ROLES as readonly string[]).includes(r));

export const FEEDBACK_STATUSES = ["received", "needs_info", "accepted", "merged", "not_planned", "released"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
/** Plain words shown to the person who reported it. */
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  received: "Received", needs_info: "We need more information", accepted: "Planned", merged: "Planned (combined with a similar report)", not_planned: "Not planned", released: "Released",
};

export const ROADMAP_COLUMNS = ["now", "next", "later", "done"] as const;
export type RoadmapColumn = (typeof ROADMAP_COLUMNS)[number];
export const ROADMAP_LABEL: Record<RoadmapColumn, string> = { now: "Now", next: "Next", later: "Later", done: "Done" };
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const AREAS = ["general", "investors", "funds", "clients", "sales", "accounting", "tax", "documents", "banking", "marketing", "cap table", "foundations", "wealth", "operations"] as const;

/** What a reporter sees for a status that's planned but in progress on the roadmap. */
export function reporterStatus(status: FeedbackStatus, backlogColumn: RoadmapColumn | null): string {
  if ((status === "accepted" || status === "merged") && backlogColumn === "now") return "In progress";
  return FEEDBACK_STATUS_LABEL[status];
}

export type TriageAction = "accept" | "merge" | "needs_info" | "not_planned";
/** A triage decision on an incoming report. Pure, for tests. */
export function triageProblem(a: { roles: readonly string[]; status: FeedbackStatus; action: TriageAction; note?: string | null | undefined; mergeInto?: string | null | undefined; selfId?: string }): string | null {
  if (!canManageTech(a.roles)) return "Only Super Admin, Product Reviewers and the Tech team can triage reports.";
  if (a.status === "released") return "This report was already released.";
  if (a.status === "merged" || (a.status === "accepted" && a.action !== "merge")) return "This report is already on the backlog.";
  if (a.action === "not_planned" && (a.note ?? "").trim().length < 5) return "Give a short reason it isn't planned; the reporter will see it.";
  if (a.action === "needs_info" && (a.note ?? "").trim().length < 5) return "Say what information you need; the reporter will see it.";
  if (a.action === "merge" && (!a.mergeInto || a.mergeInto === a.selfId)) return "Choose the report to combine this with.";
  return null;
}

export function feedbackTextProblem(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) { const p = t ? sensitiveTextProblem(t) : null; if (p) return p; }
  return null;
}

/** Strips ids and query strings so caught errors group by screen, never by record. */
export function normalizeErrorPath(path: string | null | undefined): string {
  const p = String(path ?? "/").split(/[?#]/)[0] || "/";
  return p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":record").replace(/\/\d{3,}(?=\/|$)/g, "/:record").slice(0, 200);
}
export const errorFingerprint = (action: string | null | undefined, path: string | null | undefined) => `error:${String(action ?? "Error").slice(0, 120)}|${normalizeErrorPath(path)}`;

export type ErrorEvent = { action: string | null; path: string | null; created_at: string; user_id: string | null };
export type ErrorGroup = { fingerprint: string; message: string; page: string; count: number; people: number; lastHour: number; firstSeen: string; lastSeen: string };
/** Groups caught errors by message and screen. `now` is passed in for tests. */
export function groupErrors(events: readonly ErrorEvent[], now = Date.now()): ErrorGroup[] {
  const m = new Map<string, ErrorGroup & { users: Set<string> }>();
  for (const e of events) {
    const fp = errorFingerprint(e.action, e.path);
    const g = m.get(fp) ?? { fingerprint: fp, message: String(e.action ?? "Error"), page: normalizeErrorPath(e.path), count: 0, people: 0, lastHour: 0, firstSeen: e.created_at, lastSeen: e.created_at, users: new Set<string>() };
    g.count++;
    if (e.user_id) g.users.add(e.user_id);
    if (now - Date.parse(e.created_at) <= 3_600_000) g.lastHour++;
    if (e.created_at < g.firstSeen) g.firstSeen = e.created_at;
    if (e.created_at > g.lastSeen) g.lastSeen = e.created_at;
    m.set(fp, g);
  }
  return [...m.values()].map(({ users, ...g }) => ({ ...g, people: users.size })).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
/** Slack alert threshold for a caught-error group. */
export const ERROR_ALERT_PER_HOUR = 5;
export const shouldAlertError = (g: Pick<ErrorGroup, "lastHour">) => g.lastHour >= ERROR_ALERT_PER_HOUR;
