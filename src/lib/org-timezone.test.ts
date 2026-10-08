import { describe, expect, it } from "vitest";
import { fromZonedInput, hourIn, toZonedInput, zonedToUtc } from "./org-timezone";

describe("org time zone", () => {
  it("converts Chicago wall time to UTC across DST", () => {
    expect(zonedToUtc(2026, 10, 12, 9, 0, "America/Chicago").toISOString()).toBe("2026-10-12T14:00:00.000Z"); // CDT
    expect(zonedToUtc(2026, 12, 7, 9, 0, "America/Chicago").toISOString()).toBe("2026-12-07T15:00:00.000Z"); // CST
  });
  it("round-trips datetime inputs and reads local hour", () => {
    const iso = fromZonedInput("2026-10-08T13:30", "America/Chicago");
    expect(iso).toBe("2026-10-08T18:30:00.000Z");
    expect(toZonedInput(iso, "America/Chicago")).toBe("2026-10-08T13:30");
    expect(hourIn(new Date(iso), "America/Denver")).toBe(12);
  });
});

import { ymdIn, moveToDay, ymdStartUtc, mondayOf } from "./org-timezone";
describe("calendar day boundaries use the configured zone", () => {
  // 11:30 PM Chicago on Oct 12 2026 (CDT) = 04:30Z Oct 13
  const iso = "2026-10-13T04:30:00.000Z";
  it("same item lands on each configured view's correct day", () => {
    expect(ymdIn(iso, "America/Chicago")).toBe("2026-10-12");
    expect(ymdIn(iso, "America/Denver")).toBe("2026-10-12");
    expect(ymdIn(iso, "America/Los_Angeles")).toBe("2026-10-12");
    expect(ymdIn(iso, "America/New_York")).toBe("2026-10-13");
  });
  it("is independent of the viewer's device clock (process TZ)", () => {
    // Result depends only on the tz argument; Intl ignores process.env.TZ here.
    expect(ymdIn(new Date(iso), "America/Chicago")).toBe("2026-10-12");
  });
  it("handles DST transition days", () => {
    expect(ymdStartUtc("2026-11-01", "America/Chicago").toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(ymdStartUtc("2026-11-02", "America/Chicago").toISOString()).toBe("2026-11-02T06:00:00.000Z");
    expect(ymdStartUtc("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });
  it("reschedule keeps wall-clock time across DST", () => {
    expect(moveToDay("2026-10-30T14:00:00.000Z", "2026-11-03", "America/Chicago")).toBe("2026-11-03T15:00:00.000Z");
    expect(moveToDay(null, "2026-11-03", "America/Chicago")).toBe("2026-11-03T15:00:00.000Z");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
  });
});
