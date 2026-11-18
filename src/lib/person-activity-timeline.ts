/**
 * Connects a person's recorded activity into one timeline: page views and clicks join the
 * sign-in session they happened in, and emails and invitation-link opens from before the
 * account existed sit alongside them. Pure; reads recorded evidence only, never typed values.
 */
export type SessionRow = { id: string; event_type: string; action: string | null; path: string | null; session_id: string | null; created_at: string; [k: string]: unknown };
export type ClickRow = { id: string; kind: string; path: string | null; label: string | null; created_at: string };
export type TimelineRow = { id: string; when: string; kind: "Email" | "Invitation"; what: string };

const CLICK_ACTION: Record<string, string> = { page: "Viewed", click: "Clicked", action: "Action" };

/** Page views and clicks become session rows, placed in the latest sign-in session that started at or before them. */
export function attachClicksToSessions(security: SessionRow[], clicks: ClickRow[]): SessionRow[] {
  const starts = security.filter((s) => s.session_id).map((s) => ({ at: s.created_at, sid: s.session_id as string })).sort((a, b) => a.at.localeCompare(b.at));
  const sessionAt = (at: string) => { let sid: string | null = null; for (const s of starts) { if (s.at <= at) sid = s.sid; else break; } return sid; };
  const fromClicks: SessionRow[] = clicks.map((c) => ({
    id: `activity:${c.id}`, event_type: c.kind, action: `${CLICK_ACTION[c.kind] ?? c.kind}${c.label ? `: ${c.label}` : ""}`,
    path: c.path, session_id: sessionAt(c.created_at), created_at: c.created_at,
    ip: null, city: null, region: null, country: null, user_agent: null,
  }));
  return [...security, ...fromClicks].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Emails and invitation-link opens that can happen before (or without) a sign-in. */
export function outsideAccountEvents(d: {
  sends?: { id: string; subject?: string | null; kind?: string | null; at: string }[];
  opens?: { id: string; template?: string | null; at: string }[];
  clicks?: { id: string; link_label?: string | null; template?: string | null; at: string }[];
  linkOpens?: { id: string; at: string }[];
}): TimelineRow[] {
  const label = (s: string | null | undefined) => (s ? s.replace(/[-_]/g, " ") : "");
  return [
    ...(d.sends ?? []).map((x) => ({ id: `send:${x.id}`, when: x.at, kind: "Email" as const, what: `Email sent${x.subject ? `: ${x.subject}` : x.kind ? `: ${label(x.kind)}` : ""}` })),
    ...(d.opens ?? []).map((x) => ({ id: `open:${x.id}`, when: x.at, kind: "Email" as const, what: `Email opened${x.template ? `: ${label(x.template)}` : ""}` })),
    ...(d.clicks ?? []).map((x) => ({ id: `eclick:${x.id}`, when: x.at, kind: "Email" as const, what: `Email link clicked${x.link_label ? `: ${x.link_label}` : x.template ? `: ${label(x.template)}` : ""}` })),
    ...(d.linkOpens ?? []).map((x) => ({ id: `invite:${x.id}`, when: x.at, kind: "Invitation" as const, what: "Opened their invitation link" })),
  ].sort((a, b) => b.when.localeCompare(a.when));
}
