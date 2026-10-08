/** Research monitoring: pure health rules (no I/O). Failures raise alerts; they never create content. */
export type SourceRow = {
  key: string; name: string; kind: string; active: boolean;
  last_fetched_at: string | null; last_success_at: string | null; last_error: string | null;
  consecutive_failures: number; last_item_count: number | null; last_invalid_dates: number; expected_interval_minutes: number;
};
export type Health = "healthy" | "stale" | "degraded" | "failing" | "down" | "manual" | "never_run";
export const HEALTH_LABEL: Record<Health, string> = {
  healthy: "Healthy", stale: "Not refreshed on time", degraded: "Format or data problem", failing: "Failing", down: "Unavailable", manual: "Manual entry", never_run: "Not run yet",
};
export const REPEATED_FAILURES = 3;

/** An OK response that yields zero items for a feed that normally has items signals a changed format. */
export function formatChanged(itemCount: number, prevCount: number | null) {
  return itemCount === 0 && (prevCount ?? 0) > 0;
}
/** A publication date is invalid when missing/unparseable or more than a day in the future. */
export function invalidDate(iso: string | null, now = new Date()) {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return !Number.isFinite(t) || t > now.getTime() + 864e5;
}

export function sourceHealth(s: SourceRow, now = new Date()): { health: Health; nextExpected: string | null } {
  const auto = ["rss", "atom", "federal_register"].includes(s.kind);
  if (!auto) return { health: "manual", nextExpected: null };
  const next = s.last_fetched_at ? new Date(new Date(s.last_fetched_at).getTime() + s.expected_interval_minutes * 60000).toISOString() : null;
  if (!s.last_fetched_at) return { health: "never_run", nextExpected: null };
  if (s.consecutive_failures >= REPEATED_FAILURES) return { health: "down", nextExpected: next };
  if (s.last_error) return { health: "failing", nextExpected: next };
  const since = s.last_success_at ? now.getTime() - new Date(s.last_success_at).getTime() : Infinity;
  if (since > s.expected_interval_minutes * 2 * 60000) return { health: "stale", nextExpected: next };
  if (s.last_item_count === 0 || s.last_invalid_dates > 0) return { health: "degraded", nextExpected: next };
  return { health: "healthy", nextExpected: next };
}

export type AlertSpec = { kind: string; subject_key: string; severity: "info" | "warning" | "critical"; message: string };
export const ALERT_LABEL: Record<string, string> = {
  source_unavailable: "Research source unavailable", source_stale: "Source not refreshed on time", repeated_failure: "Repeated ingestion failure",
  format_changed: "Source format changed", invalid_dates: "Invalid publication dates", ai_credits: "AI processing credits exhausted",
  missing_citations: "Missing citations", ideas_failed: "Daily idea generation failed", formd_digest_failed: "Weekly Form D digest failed",
  duplicates: "Duplicate stories", job_failed: "Scheduled research job failed", job_slow: "Research job running long",
};

export type HealthInput = {
  sources: SourceRow[]; now?: Date;
  aiPaused: string | null;
  recentRuns: { status: string; started_at: string; finished_at: string | null; error: string | null; result?: any }[];
  itemsMissingCitations: { id: string; title: string }[];
  duplicateGroups: number;
  formDParseErrorsThisWeek: number; formDFilingsThisWeek: number;
};

/** Every open condition becomes one alert key; conditions no longer present auto-resolve. */
export function evaluate(h: HealthInput): AlertSpec[] {
  const now = h.now ?? new Date(), out: AlertSpec[] = [];
  for (const s of h.sources.filter((x) => x.active)) {
    const { health } = sourceHealth(s, now);
    if (health === "down") out.push({ kind: "repeated_failure", subject_key: s.key, severity: "critical", message: `${s.name} failed ${s.consecutive_failures} times in a row: ${s.last_error ?? "unknown error"}` });
    else if (health === "failing") out.push({ kind: "source_unavailable", subject_key: s.key, severity: "warning", message: `${s.name} could not be retrieved: ${s.last_error}` });
    if (health === "stale") out.push({ kind: "source_stale", subject_key: s.key, severity: "warning", message: `${s.name} hasn't refreshed successfully since ${s.last_success_at ?? "never"}.` });
    if (!s.last_error && s.last_item_count === 0) out.push({ kind: "format_changed", subject_key: s.key, severity: "warning", message: `${s.name} answered but no stories could be read — its format may have changed.` });
    if (s.last_invalid_dates > 0) out.push({ kind: "invalid_dates", subject_key: s.key, severity: "info", message: `${s.last_invalid_dates} ${s.name} stories had a missing or invalid publication date.` });
  }
  if (h.aiPaused) out.push({ kind: "ai_credits", subject_key: "ai", severity: "critical", message: h.aiPaused });
  const last = h.recentRuns[0];
  if (last && (last.status === "failed" || last.status === "rate_limited")) out.push({ kind: "job_failed", subject_key: "research", severity: last.status === "failed" ? "critical" : "warning", message: `The last research run ${last.status === "failed" ? "failed" : "was rate limited"}: ${last.error ?? ""}`.trim() });
  if (last && last.status === "running" && now.getTime() - new Date(last.started_at).getTime() > 15 * 60000) out.push({ kind: "job_slow", subject_key: "research", severity: "warning", message: "A research run has been running for more than 15 minutes." });
  const ideasRun = h.recentRuns.find((r) => r.result && "ideas" in r.result || (r.result?.ideasError));
  if (ideasRun?.result?.ideasError) out.push({ kind: "ideas_failed", subject_key: "ideas", severity: "warning", message: `Daily idea generation failed: ${ideasRun.result.ideasError}` });
  for (const i of h.itemsMissingCitations) out.push({ kind: "missing_citations", subject_key: i.id, severity: "warning", message: `"${i.title}" is in review without any stored source citations.` });
  if (h.duplicateGroups > 0) out.push({ kind: "duplicates", subject_key: "stories", severity: "info", message: `${h.duplicateGroups} headlines appear more than once in the last 7 days under different links.` });
  if (h.formDFilingsThisWeek > 0 && h.formDParseErrorsThisWeek / h.formDFilingsThisWeek > 0.5) out.push({ kind: "formd_digest_failed", subject_key: "formd", severity: "warning", message: `${h.formDParseErrorsThisWeek} of ${h.formDFilingsThisWeek} Form D filings this week couldn't be read, so the weekly digest is incomplete.` });
  return out;
}

/** Notify on first sight, and again (escalation) for critical alerts still open after 24 hours. */
export function shouldNotify(a: { notified_at: string | null; severity: string; acknowledged_at: string | null }, now = new Date()) {
  if (!a.notified_at) return true;
  return a.severity === "critical" && !a.acknowledged_at && now.getTime() - new Date(a.notified_at).getTime() > 24 * 3600000;
}

/** Normalized headline for cross-link duplicate detection. */
export const headlineKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
