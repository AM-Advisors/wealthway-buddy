/** Recorded evidence only: never proof that every device is online or offline. */
export type SessionEvidence = { event_type: string; action?: string | null; created_at: string };
export function accountSessionStatus(events: SessionEvidence[], revokedAfter: string | null, lastSignIn: string | null) {
  const time = (s: string | null) => s ? Date.parse(s) : NaN;
  const latest = events.filter(e => ["sign_in", "sign_out", "session_timeout"].includes(e.event_type) && e.action !== "signed out other sessions" && Number.isFinite(time(e.created_at))).sort((a,b) => time(b.created_at)-time(a.created_at))[0];
  const at = latest?.created_at ?? lastSignIn;
  if (revokedAfter && Number.isFinite(time(revokedAfter)) && (!at || time(revokedAfter) >= Math.max(time(at), time(lastSignIn) || 0))) return { state: "revoked" as const, at: revokedAfter };
  if (lastSignIn && (!latest || time(lastSignIn) > time(latest.created_at))) return { state: "sign_in_recorded" as const, at: lastSignIn };
  if (latest?.event_type === "sign_out") return { state: "sign_out_recorded" as const, at: latest.created_at };
  if (latest?.event_type === "session_timeout") return { state: "timeout_recorded" as const, at: latest.created_at };
  if (latest) return { state: "sign_in_recorded" as const, at: latest.created_at };
  return { state: "unknown" as const, at: null };
}
