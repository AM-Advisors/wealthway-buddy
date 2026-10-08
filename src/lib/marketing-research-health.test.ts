import { describe, expect, it } from "vitest";
import { evaluate, formatChanged, invalidDate, shouldNotify, sourceHealth, type SourceRow } from "./marketing-research-health";

const now = new Date("2026-10-08T20:00:00Z");
const src = (x: Partial<SourceRow>): SourceRow => ({ key: "sec_press", name: "SEC press", kind: "rss", active: true, last_fetched_at: "2026-10-08T19:30:00Z", last_success_at: "2026-10-08T19:30:00Z", last_error: null, consecutive_failures: 0, last_item_count: 20, last_invalid_dates: 0, expected_interval_minutes: 90, ...x });
const base = { aiPaused: null, recentRuns: [], itemsMissingCitations: [], duplicateGroups: 0, formDParseErrorsThisWeek: 0, formDFilingsThisWeek: 0, now };

describe("research monitoring", () => {
  it("classifies source health", () => {
    expect(sourceHealth(src({}), now).health).toBe("healthy");
    expect(sourceHealth(src({ last_error: "Feed 503", consecutive_failures: 1 }), now).health).toBe("failing");
    expect(sourceHealth(src({ last_error: "Feed 503", consecutive_failures: 3 }), now).health).toBe("down");
    expect(sourceHealth(src({ last_success_at: "2026-10-08T10:00:00Z" }), now).health).toBe("stale");
    expect(sourceHealth(src({ kind: "manual" }), now).health).toBe("manual");
    expect(sourceHealth(src({ last_fetched_at: null }), now).health).toBe("never_run");
  });
  it("detects changed formats and invalid dates", () => {
    expect(formatChanged(0, 20)).toBe(true); expect(formatChanged(0, 0)).toBe(false); expect(formatChanged(5, 20)).toBe(false);
    expect(invalidDate(null, now)).toBe(true); expect(invalidDate("garbage", now)).toBe(true);
    expect(invalidDate("2027-01-01T00:00:00Z", now)).toBe(true); expect(invalidDate("2026-10-07T00:00:00Z", now)).toBe(false);
  });
  it("raises one alert per condition", () => {
    const a = evaluate({ ...base, sources: [src({ last_error: "Feed 503", consecutive_failures: 4 }), src({ key: "fr_sec", name: "FR", last_success_at: "2026-10-07T00:00:00Z" })],
      aiPaused: "AI unavailable [402]", recentRuns: [{ status: "failed", started_at: "", finished_at: "", error: "boom", result: { ideasError: "x" } }],
      itemsMissingCitations: [{ id: "i1", title: "T" }], duplicateGroups: 2, formDParseErrorsThisWeek: 8, formDFilingsThisWeek: 10 });
    expect(a.map((x) => x.kind).sort()).toEqual(["ai_credits", "duplicates", "formd_digest_failed", "ideas_failed", "job_failed", "missing_citations", "repeated_failure", "source_stale"]);
    expect(evaluate({ ...base, sources: [src({})] })).toEqual([]);
  });
  it("notifies once, escalates critical after 24h unacknowledged", () => {
    expect(shouldNotify({ notified_at: null, severity: "warning", acknowledged_at: null }, now)).toBe(true);
    expect(shouldNotify({ notified_at: "2026-10-08T00:00:00Z", severity: "warning", acknowledged_at: null }, now)).toBe(false);
    expect(shouldNotify({ notified_at: "2026-10-07T10:00:00Z", severity: "critical", acknowledged_at: null }, now)).toBe(true);
    expect(shouldNotify({ notified_at: "2026-10-07T10:00:00Z", severity: "critical", acknowledged_at: "x" }, now)).toBe(false);
  });
});
