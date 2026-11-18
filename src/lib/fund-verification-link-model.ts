/**
 * Fund verification link sessions: pure projection of identity-check sessions
 * started from a fund's own verification link (offerings.didit_workflow_id)
 * against the fund's investor records. Display only; never changes a record.
 */
export type LinkSessionState = "on_fund" | "needs_adding" | "in_progress" | "not_investor" | "closed";

export type LinkSessionEvent = { sessionId: string; status: string | null; receivedAt: string };

export type LinkSessionInput = {
  sessionId: string;
  events: LinkSessionEvent[];
  onFund: boolean;
  dismissed: boolean;
};

const FINISHED = new Set(["approved", "in review", "declined", "resubmitted"]);
const OPEN = new Set(["in progress", "not started"]);
/** An unfinished session counts as still open for this long after its last activity. */
export const OPEN_WINDOW_DAYS = 7;

export function latestEvent(events: LinkSessionEvent[]): LinkSessionEvent | null {
  return events.reduce<LinkSessionEvent | null>((m, e) => (!m || e.receivedAt > m.receivedAt ? e : m), null);
}

/** Finished status wins over a later "expired" notice: a completed check never becomes "closed". */
export function sessionStatus(events: LinkSessionEvent[]): string | null {
  const finished = [...events].filter((e) => FINISHED.has(String(e.status ?? "").toLowerCase())).sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))[0];
  return finished?.status ?? latestEvent(events)?.status ?? null;
}

export function classifyLinkSession(s: LinkSessionInput, now: Date = new Date()): LinkSessionState {
  if (s.onFund) return "on_fund";
  const status = String(sessionStatus(s.events) ?? "").toLowerCase();
  if (FINISHED.has(status)) return s.dismissed ? "not_investor" : "needs_adding";
  if (s.dismissed) return "not_investor";
  const last = latestEvent(s.events);
  if (OPEN.has(status) && last && now.getTime() - new Date(last.receivedAt).getTime() < OPEN_WINDOW_DAYS * 86_400_000) return "in_progress";
  return "closed";
}

export const LINK_STATE_LABEL: Record<LinkSessionState, string> = {
  on_fund: "On the fund",
  needs_adding: "Finished, not on the fund",
  in_progress: "Opened, not finished",
  not_investor: "Marked not an investor",
  closed: "Expired or never started",
};

export function countLinkStates(states: LinkSessionState[]): Record<LinkSessionState, number> {
  const out: Record<LinkSessionState, number> = { on_fund: 0, needs_adding: 0, in_progress: 0, not_investor: 0, closed: 0 };
  for (const s of states) out[s] += 1;
  return out;
}

/** Statuses that should open a staff follow-up when nobody on the fund holds the session. */
export function needsFollowUp(status: string | null | undefined): boolean {
  return FINISHED.has(String(status ?? "").toLowerCase());
}
