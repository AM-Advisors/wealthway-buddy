import { describe, expect, it } from "vitest";
import { blockedReason, exceptionReason, fundingExceptionPlan } from "@/lib/onboarding-exception-reason";

describe("blocked reason", () => {
  it("shows Karl's split-wire shortfall in dollars", () => {
    expect(exceptionReason({ type: "underfunding", detail: "Expected 225000000 cents, received 150000000 cents." }))
      .toBe("Underfunding: expected $2,250,000, received $1,500,000 (short $750,000)");
  });
  it("non-funding issues show only their label", () => {
    expect(exceptionReason({ type: "aml_review", detail: "private screening note" })).toBe("Compliance review");
  });
  it("counts extra open issues", () => {
    expect(blockedReason([{ type: "aml_review" }, { type: "kyc_failed" }, { type: "signature_missing" }])).toBe("Compliance review · 2 more open issues");
  });
});

describe("funding alerts after money is recorded", () => {
  const open = [{ id: "u1", type: "underfunding" }];
  it("second wire completing $2,250,000 clears the shortfall and raises nothing", () => {
    const p = fundingExceptionPlan({ status: "funded", expectedCents: 225000000, receivedCents: 225000000, open });
    expect(p.resolve.map((r) => r.id)).toEqual(["u1"]);
    expect(p.raise).toBeNull();
  });
  it("a still-short second wire replaces the old alert with current amounts", () => {
    const p = fundingExceptionPlan({ status: "partially_funded", expectedCents: 225000000, receivedCents: 200000000, open });
    expect(p.resolve.map((r) => r.id)).toEqual(["u1"]);
    expect(p.raise).toEqual({ type: "underfunding", detail: "Expected 225000000 cents, received 200000000 cents." });
  });
  it("an overage always stays open for a person", () => {
    const p = fundingExceptionPlan({ status: "overfunded", expectedCents: 100, receivedCents: 150, open });
    expect(p.raise?.type).toBe("overfunding");
    const full = fundingExceptionPlan({ status: "funded", expectedCents: 100, receivedCents: 100, open: [{ id: "o1", type: "overfunding" }] });
    expect(full.resolve).toEqual([]);
  });
  it("other open issues are never touched", () => {
    const p = fundingExceptionPlan({ status: "funded", expectedCents: 1, receivedCents: 1, open: [{ id: "a", type: "aml_review" }] });
    expect(p.resolve).toEqual([]);
  });
});
