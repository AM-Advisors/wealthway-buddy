import { describe, expect, it } from "vitest";
import { basisStaleness, staleBasisOverrideError } from "@/lib/distributions-model";

describe("distribution basis staleness (pilot M11)", () => {
  it("flags capital activity after the basis date", () => {
    const r = basisStaleness({ basisAsOf: "2026-07-31", effectiveDate: "2026-09-15", activity: [{ date: "2026-08-10", type: "contribution", amountCents: 50_000_00 }] });
    expect(r.stale).toBe(true);
    expect(r.reason).toMatch(/STALE ALLOCATION BASIS/);
  });
  it("is current when nothing moved after the basis date", () => {
    expect(basisStaleness({ basisAsOf: "2026-08-31", effectiveDate: "2026-09-15", activity: [{ date: "2026-08-10", type: "contribution", amountCents: 1 }] }).stale).toBe(false);
    expect(basisStaleness({ basisAsOf: "2026-08-31", effectiveDate: "2026-09-15", activity: [{ date: "2026-10-01", type: "contribution", amountCents: 1 }] }).stale).toBe(false);
  });
  it("is stale when no basis date exists", () => {
    expect(basisStaleness({ basisAsOf: null, effectiveDate: "2026-09-15", activity: [] }).stale).toBe(true);
  });
  it("needs an independent reasoned override", () => {
    expect(staleBasisOverrideError({ reason: "ok", userId: "a", preparedBy: "b" })).toMatch(/reason/);
    expect(staleBasisOverrideError({ reason: "No economic change since July", userId: "a", preparedBy: "a" })).toMatch(/preparer/);
    expect(staleBasisOverrideError({ reason: "No economic change since July", userId: "a", preparedBy: "b" })).toBeNull();
  });
});
