// SIMULATED (pure model) tests — no database, no live APIs.
import { describe, expect, it } from "vitest";
import { JOBS, isStale, missedSlots, overallStatus, postStatusAfter, shouldRun, slotKey } from "./marketing-jobs-model";

const job = (k: string) => JOBS.find((j) => j.key === k)!;

describe("scheduler", () => {
  it("one slot key per 5-minute window (duplicate prevention)", () => {
    expect(slotKey(job("publishing_queue"), new Date("2026-10-08T10:03:10Z"))).toBe("2026-10-08T10:00");
    expect(slotKey(job("publishing_queue"), new Date("2026-10-08T10:04:59Z"))).toBe("2026-10-08T10:00");
  });
  it("never runs a slot twice", () => { expect(shouldRun(job("research"), new Date("2026-10-08T10:31:00Z"), true).run).toBe(false); });
  it("catches up read-only jobs late, never publishing", () => {
    const late = new Date("2026-10-08T10:50:00Z");
    expect(shouldRun(job("research"), late, false)).toEqual({ run: true, catchUp: true });
    expect(shouldRun(job("drive_sync"), late, false)).toEqual({ run: true, catchUp: true });
    expect(JOBS.filter((j) => j.catchUp).map((j) => j.key)).not.toContain("publishing_queue");
    expect(JOBS.filter((j) => j.catchUp).map((j) => j.key)).not.toContain("linkedin_personal");
  });
  it("daily slot belongs to the previous day before its time", () => {
    expect(slotKey(job("metrics"), new Date("2026-10-08T09:00:00Z"))).toBe("2026-10-07T13:40");
  });
  it("detects missed slots", () => {
    const m = missedSlots(job("research"), new Date("2026-10-08T06:00:00Z"), new Date("2026-10-08T10:45:00Z"), new Set(["2026-10-08T08:30"]));
    expect(m).toEqual(["2026-10-08T09:30", "2026-10-08T07:30", "2026-10-08T06:30"]);
  });
  it("reports partial / failed / blocked distinctly", () => {
    expect(overallStatus([{ ok: true }, { ok: false }])).toBe("partial");
    expect(overallStatus([{ ok: false }])).toBe("failed");
    expect(overallStatus([{ ok: false, blocked: true }])).toBe("blocked");
    expect(overallStatus([])).toBe("skipped");
  });
  it("does not replay long-overdue items", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(isStale("2026-10-08T11:00:00Z", now)).toBe(false);
    expect(isStale("2026-10-07T12:00:00Z", now)).toBe(true);
  });
});

describe("blocked LinkedIn company channel", () => {
  it("blocked never fails the post or counts as published", () => {
    expect(postStatusAfter("live", ["blocked"])).toBe("approved");
    expect(postStatusAfter("live", ["blocked", "published"])).toBe("published");
    expect(postStatusAfter("live", ["blocked", "failed"])).toBe("failed");
    expect(postStatusAfter("test", ["blocked", "test_passed"])).toBe("approved");
  });
});
