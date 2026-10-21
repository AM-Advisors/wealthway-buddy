import { describe, expect, it } from "vitest";
import { balanceTie, dedupeKey, manualLineError, pastDateError } from "./fund-books-model";

describe("hand-entered books", () => {
  it("a typed statement ties when opening plus lines equals closing", () => {
    expect(balanceTie(100_000, 125_000, [{ amount_cents: 50_000, direction: "in" }, { amount_cents: 25_000, direction: "out" }]).ties).toBe(true);
    expect(balanceTie(100_000, 125_000, [{ amount_cents: 50_000, direction: "in" }]).gapCents).toBe(-25_000);
  });
  it("the duplicate key matches the same date, amount, direction and description", () => {
    expect(dedupeKey("2026-10-01", 5_000_000, "in", "WIRE Kevin Sykes")).toBe(dedupeKey("2026-10-01", 5_000_000, "in", "wire  kevin sykes"));
    expect(dedupeKey("2026-10-01", 5_000_000, "in", "x")).not.toBe(dedupeKey("2026-10-01", 5_000_000, "out", "x"));
  });
  it("a paid date is required and can't be in the future", () => {
    expect(pastDateError(null, "2026-10-21")).not.toBeNull();
    expect(pastDateError("2026-10-22", "2026-10-21")).toMatch(/future/);
    expect(pastDateError("2026-10-21", "2026-10-21")).toBeNull();
  });
  it("typed lines must fall inside the statement period and be above zero", () => {
    const p = { start: "2026-09-01", end: "2026-09-30" };
    expect(manualLineError({ postedOn: "2026-08-31", description: "x", amountCents: 100, direction: "in" }, p, "2026-10-21")).toMatch(/before/);
    expect(manualLineError({ postedOn: "2026-09-15", description: "x", amountCents: 0, direction: "in" }, p, "2026-10-21")).toMatch(/above zero/);
    expect(manualLineError({ postedOn: "2026-09-15", description: "Wire", amountCents: 100, direction: "out" }, p, "2026-10-21")).toBeNull();
  });
});
