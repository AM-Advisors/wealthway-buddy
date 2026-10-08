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
