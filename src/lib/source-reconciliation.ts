/**
 * Cross-source reconciliation - pure rules. Read-only staging; nothing here
 * changes a production person, investment or verification record.
 * "Source record found", "Matched", "Historically verified", "Currently
 * eligible" and "Portal ready" are separate facts and are never combined.
 */
export type SourceId = "harmonious" | "didit" | "simplici" | "wix" | "google_drive" | "box";
export type ConnectionStatus = "connected" | "partial" | "not_connected" | "blocked" | "error";
export type MatchClass = "confirmed" | "probable" | "unmatched" | "conflicting" | "duplicate_verification" | "manual_review";
export type ReviewDecision = "confirm_match" | "reject_match" | "mark_unresolved" | "flag_duplicate" | "link_fund" | "request_evidence" | "stage_for_import";

export const SOURCE_LABEL: Record<SourceId, string> = {
  harmonious: "Harmonious", didit: "Didit", simplici: "Simplici", wix: "Wix", google_drive: "Google Drive", box: "Box",
};
export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected", partial: "Partially available", not_connected: "Not connected", blocked: "Blocked", error: "Error",
};
export const CLASS_LABEL: Record<MatchClass, string> = {
  confirmed: "Confirmed match", probable: "Probable match", unmatched: "Unmatched", conflicting: "Conflicting",
  duplicate_verification: "Duplicate verification", manual_review: "Requires manual review",
};
export const DECISION_LABEL: Record<ReviewDecision, string> = {
  confirm_match: "Confirm match", reject_match: "Reject match", mark_unresolved: "Mark unresolved", flag_duplicate: "Flag duplicate",
  link_fund: "Link proposed fund", request_evidence: "Request more evidence", stage_for_import: "Stage for import",
};

export type SourceCounts = {
  records: number; confirmed: number; probable: number; unmatched: number; conflicting: number;
  missingEvidence: number; errors: number; reviewRequired: number;
};
export type SourceCard = { source: SourceId; status: ConnectionStatus; lastInventoryAt: string | null; counts: SourceCounts | null; note: string };

/** An unavailable source never reports counts - null, not zero. */
export function sourceCard(source: SourceId, status: ConnectionStatus, note: string, counts: SourceCounts | null = null, lastInventoryAt: string | null = null): SourceCard {
  const available = status === "connected" || status === "partial";
  return { source, status, note, counts: available ? counts : null, lastInventoryAt: available ? lastInventoryAt : null };
}

/** One Didit verification session (or uncorrelated event), as staged evidence. */
export type DiditEvent = { eventId: string; type: string; sessionId: string | null; status: string | null; vendorData: string | null; applicationId: string | null; receivedAt: string };
export type DiditLink = { via: "session" | "vendor_data" | "application"; personId: string | null; verificationId: string };
export type DiditStaged = {
  ref: string; sessionId: string | null; personIds: string[]; firstSeen: string; lastSeen: string;
  verificationType: "identity" | "user_profile" | "business"; latestOutcome: string | null; eventCount: number;
  linkedVia: DiditLink["via"] | null; matchClass: MatchClass; missing: string[]; action: string;
};

const typeOf = (t: string): DiditStaged["verificationType"] => t.startsWith("business.") ? "business" : t.startsWith("user.") ? "user_profile" : "identity";

/** Groups events by session (or by event when no session exists) and classifies deterministically. */
export function stageDidit(events: DiditEvent[], links: (e: DiditEvent) => DiditLink[]): DiditStaged[] {
  const groups = new Map<string, DiditEvent[]>();
  for (const e of events) {
    const k = e.sessionId ? `session:${e.sessionId}` : `event:${e.eventId}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const out: DiditStaged[] = [];
  for (const [ref, evs] of groups) {
    evs.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const all = evs.flatMap(links);
    const persons = [...new Set(all.map((l) => l.personId).filter(Boolean) as string[])];
    const verifications = [...new Set(all.map((l) => l.verificationId))];
    const via = all.find((l) => l.via === "session")?.via ?? all[0]?.via ?? null;
    const last = evs[evs.length - 1]!;
    const missing: string[] = [];
    if (!evs[0]!.sessionId) missing.push("session reference");
    if (!all.length) missing.push("Harmonious application or verification link");
    else if (!persons.length) missing.push("person link");
    let matchClass: MatchClass;
    if (persons.length > 1) matchClass = "conflicting";
    else if (verifications.length > 1) matchClass = "duplicate_verification";
    else if (persons.length === 1 && via === "session") matchClass = "confirmed";
    else if (persons.length === 1) matchClass = "probable";
    else if (all.length) matchClass = "manual_review";
    else matchClass = "unmatched";
    const action = {
      confirmed: "Confirm the link. Historical result only; current eligibility needs its own review.",
      probable: "Review the reference and confirm or reject the person link.",
      conflicting: "Investigate: the same session points to more than one person.",
      duplicate_verification: "Flag the duplicate and keep the history of each verification.",
      manual_review: "Linked to an application with no person; resolve the person before any use.",
      unmatched: "Keep as history. Request evidence or mark unresolved; do not start a new session.",
    }[matchClass];
    out.push({
      ref, sessionId: evs[0]!.sessionId, personIds: persons, firstSeen: evs[0]!.receivedAt, lastSeen: last.receivedAt,
      verificationType: typeOf(last.type), latestOutcome: last.status, eventCount: evs.length, linkedVia: via, matchClass, missing, action,
    });
  }
  return out.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export function countDidit(rows: DiditStaged[], decided: Set<string>): SourceCounts {
  const c = (k: MatchClass) => rows.filter((r) => r.matchClass === k).length;
  return {
    records: rows.length, confirmed: c("confirmed"), probable: c("probable"), unmatched: c("unmatched"),
    conflicting: c("conflicting") + c("duplicate_verification"), missingEvidence: rows.filter((r) => r.missing.length).length,
    errors: 0, reviewRequired: rows.filter((r) => r.matchClass !== "confirmed" && !decided.has(r.ref)).length,
  };
}

/** Shows only the tail of a provider reference. */
export const maskRef = (s: string | null) => (s ? `...${s.slice(-6)}` : "none");
