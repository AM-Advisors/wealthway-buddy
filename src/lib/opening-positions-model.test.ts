import { describe, expect, it } from "vitest";
import { openingDecisionError, openingPositionError, openingTieOut, unrealizedMovementCents } from "./opening-positions-model";
const j = { status: "posted", entryDate: "2025-12-31", bookId: "b" };
const p = { costBasisCents: 300_000_000, openingFairValueCents: 350_000_000, evidenceStatus: "missing_in_source" as const, asOfDate: "2025-12-31" };
describe("takeover opening positions (permanent)", () => {
  it("valid against posted opening journal", () => expect(openingPositionError(p, j, "b")).toBeNull());
  it("wrong fund refused", () => expect(openingPositionError(p, j, "other")).toMatch(/different fund/));
  it("unposted journal refused", () => expect(openingPositionError(p, { ...j, status: "draft" }, "b")).toMatch(/posted/));
  it("date must match opening", () => expect(openingPositionError({ ...p, asOfDate: "2026-01-01" }, j, "b")).toMatch(/as-of/));
  it("preparer cannot approve own", () => expect(openingDecisionError("a", "a", "prepared")).toMatch(/cannot approve/));
  it("decided cannot be re-decided", () => expect(openingDecisionError("a", "b", "approved")).toMatch(/already/));
  it("Walkthrough opening ties: cost 7.5M, FV 8.25M, unrealised 750k", () => {
    const t = openingTieOut([{ costBasisCents: 3e8, openingFairValueCents: 3.5e8 }, { costBasisCents: 2.5e8, openingFairValueCents: 2.75e8 }, { costBasisCents: 2e8, openingFairValueCents: 2e8 }], { investmentCostCents: 7.5e8, unrealizedCents: 7.5e7 });
    expect(t.ties).toBe(true);
  });
  it("a $0.01 difference fails the tie", () => expect(openingTieOut([{ costBasisCents: 1, openingFairValueCents: 1 }], { investmentCostCents: 2, unrealizedCents: 0 }).ties).toBe(false));
  it("opening $750k is never Q1 income: Lumen 3.5M -> 4.0M books +500k, not +1.0M", () => {
    expect(unrealizedMovementCents(3.5e8, 3e8, 4e8)).toBe(5e7);
    expect(unrealizedMovementCents(3.5e8, 3e8, 3.5e8) + unrealizedMovementCents(2.75e8, 2.5e8, 2.75e8) + unrealizedMovementCents(2e8, 2e8, 2e8)).toBe(0);
  });
});
