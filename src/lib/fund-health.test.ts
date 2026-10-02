import { describe, expect, it } from "vitest";
import { nextDeadline, reminderAllowed, stuckFlags } from "@/lib/fund-health";

const now = new Date("2026-10-02T12:00:00Z");
describe("fund health", () => {
  it("finds the next open deadline", () => {
    expect(nextDeadline([{ date: "2026-09-01", title: "old" }, { date: "2026-11-01", title: "b" }, { date: "2026-10-10", title: "a" }], now)?.title).toBe("a");
  });
  it("flags stuck and soon", () => {
    const f = stuckFlags({ lastActivityAt: "2026-09-20T00:00:00Z", nextDeadlineDate: "2026-10-10" }, now).map((x) => x.kind);
    expect(f).toEqual(["no_progress", "deadline_soon"]);
    expect(stuckFlags({ lastActivityAt: "2026-10-01T00:00:00Z", nextDeadlineDate: "2026-12-30" }, now)).toEqual([]);
  });
  it("spaces reminders three days apart", () => {
    expect(reminderAllowed(null, now)).toBe(true);
    expect(reminderAllowed("2026-10-01T12:00:00Z", now)).toBe(false);
    expect(reminderAllowed("2026-09-28T12:00:00Z", now)).toBe(true);
  });
});

import { mergeTimeline } from "@/lib/cross-client-queue.server";
describe("client timeline", () => {
  it("merges newest first and drops undated", () => {
    const out = mergeTimeline([[{ at: "2026-01-01", kind: "a", title: "", detail: "" }], [{ at: "2026-03-01", kind: "b", title: "", detail: "" }, { at: "", kind: "c", title: "", detail: "" }]]);
    expect(out.map((e) => e.kind)).toEqual(["b", "a"]);
  });
});
