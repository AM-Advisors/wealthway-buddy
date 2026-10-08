/**
 * Marketing scheduler model (pure). One shared tick every 5 minutes; each job has its own cadence.
 * A slot key identifies one intended run, so a (job, slot) pair runs at most once (idempotency + lock).
 */
export type JobStatus = "scheduled" | "running" | "completed" | "partial" | "failed" | "missed" | "skipped" | "blocked";

export type JobDef = {
  key: string;
  label: string;
  /** Minutes between runs. */
  everyMin: number;
  /** For hourly/daily jobs: UTC minute window start within the hour (e.g. 30 → :30-:34). */
  minute?: number;
  /** For daily jobs: UTC hour. */
  hour?: number;
  /** Safe to run late when its slot was missed (read-only ingestion). Never true for anything that publishes or sends. */
  catchUp: boolean;
};

export const JOBS: JobDef[] = [
  { key: "publishing_queue", label: "Publishing queue (posts + emails)", everyMin: 5, catchUp: false },
  { key: "linkedin_personal", label: "Personal LinkedIn scheduled posts", everyMin: 5, catchUp: false },
  { key: "clickup_sync", label: "ClickUp synchronization", everyMin: 5, catchUp: false },
  { key: "drive_sync", label: "Drive synchronization", everyMin: 60, minute: 0, catchUp: true },
  { key: "research", label: "Research ingestion, analysis, Form D digest (ideas in the 12:30 UTC run)", everyMin: 60, minute: 30, catchUp: true },
  { key: "metrics", label: "Platform metrics collection", everyMin: 1440, hour: 13, minute: 40, catchUp: true },
  { key: "search_console", label: "Search Console synchronization", everyMin: 1440, hour: 13, minute: 40, catchUp: true },
];

/** Start of the slot that contains `at` for this job (UTC). */
export function slotStart(job: JobDef, at: Date): Date {
  const d = new Date(at);
  d.setUTCSeconds(0, 0);
  if (job.everyMin <= 5) { d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5); return d; }
  if (job.everyMin === 60) {
    if (d.getUTCMinutes() < (job.minute ?? 0)) d.setUTCHours(d.getUTCHours() - 1);
    d.setUTCMinutes(job.minute ?? 0); return d;
  }
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), job.hour ?? 0, job.minute ?? 0));
  if (s > at) s.setUTCDate(s.getUTCDate() - 1);
  return s;
}
export const slotKey = (job: JobDef, at: Date) => slotStart(job, at).toISOString().slice(0, 16);

/** Is the tick at `at` inside this job's on-time window (first 5 minutes of its slot)? */
export function isOnTime(job: JobDef, at: Date) {
  return at.getTime() - slotStart(job, at).getTime() < 5 * 60_000;
}

/** Decide whether this tick should run the job, and whether it's a late catch-up. */
export function shouldRun(job: JobDef, at: Date, alreadyRanThisSlot: boolean): { run: boolean; catchUp: boolean } {
  if (alreadyRanThisSlot) return { run: false, catchUp: false };
  if (isOnTime(job, at)) return { run: true, catchUp: false };
  return job.catchUp ? { run: true, catchUp: true } : { run: false, catchUp: false };
}

/** Slots in (from, to] that should have run but have no record — reported as missed. */
export function missedSlots(job: JobDef, from: Date, to: Date, recorded: Set<string>): string[] {
  const out: string[] = [];
  const step = job.everyMin * 60_000;
  // Ignore the current slot (it may still be running) and only look at slots whose window has closed.
  let s = slotStart(job, new Date(to.getTime() - step));
  while (s.getTime() > from.getTime()) {
    const k = s.toISOString().slice(0, 16);
    if (!recorded.has(k)) out.push(k);
    s = new Date(s.getTime() - step);
  }
  return out;
}

/** A stage result → overall status. Blocked/skipped never count as failures. */
export function overallStatus(stages: { ok: boolean; blocked?: boolean; skipped?: boolean }[]): JobStatus {
  if (!stages.length) return "skipped";
  if (stages.every((s) => s.blocked)) return "blocked";
  if (stages.every((s) => s.skipped)) return "skipped";
  const bad = stages.filter((s) => !s.ok && !s.blocked && !s.skipped).length;
  if (!bad) return "completed";
  return bad === stages.length ? "failed" : "partial";
}

/** Scheduled posts/emails more than this late are never released automatically (no replay after an outage). */
export const STALE_RELEASE_MS = 6 * 3600_000;
export const isStale = (scheduledAt: string | null, now: Date) => !!scheduledAt && now.getTime() - new Date(scheduledAt).getTime() > STALE_RELEASE_MS;

/** Company LinkedIn publishing is blocked until LinkedIn approves Community Management access. */
export const LINKEDIN_COMPANY_BLOCKED_MSG = "Company LinkedIn publishing unavailable — LinkedIn approval required.";
export const LINKEDIN_COMPANY_AVAILABLE = false;

/** Post status after processing targets. Blocked targets neither fail the post nor count as published. */
export function postStatusAfter(mode: "test" | "live", targetStatuses: string[]): string {
  const live = targetStatuses.filter((s) => s !== "blocked");
  if (live.includes("failed")) return "failed";
  if (!live.length) return "approved"; // only blocked channels: stays approved, waiting for an explicit release
  if (mode === "test") return "approved";
  if (live.every((s) => s === "published")) return "published";
  return "publishing";
}
