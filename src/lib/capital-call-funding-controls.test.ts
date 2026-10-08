import { describe, expect, it } from "vitest";
import { capitalCallSegregationError, fundingAcceptanceError } from "./capital-calls-model";

describe("capital call segregation (permanent)", () => {
  it("preparer cannot review own call", () => expect(capitalCallSegregationError("u1", "u1", "review")).toMatch(/cannot review/));
  it("preparer cannot publish own call", () => expect(capitalCallSegregationError("u1", "u1", "publish")).toMatch(/cannot publish/));
  it("a different person may review and publish", () => {
    expect(capitalCallSegregationError("u1", "u2", "review")).toBeNull();
    expect(capitalCallSegregationError("u1", "u3", "publish")).toBeNull();
  });
});

describe("funding acceptance controls (permanent)", () => {
  const ok = { appliedCents: 100, transactionCents: 100, outstandingCents: 100, acceptFundsBlocks: [] as string[] };
  it("exact payment accepted", () => expect(fundingAcceptanceError(ok)).toBeNull());
  it("partial payment accepted", () => expect(fundingAcceptanceError({ ...ok, outstandingCents: 300 })).toBeNull());
  it("open AML blocks accepting funds", () => expect(fundingAcceptanceError({ ...ok, acceptFundsBlocks: ["Complete AML screening"] })).toMatch(/blocked/));
  it("missing W-9 / payout destination do not block (they never block accept_funds)", () => expect(fundingAcceptanceError(ok)).toBeNull());
  it("overpayment is refused, never absorbed into capital", () => expect(fundingAcceptanceError({ ...ok, appliedCents: 105, transactionCents: 105 })).toMatch(/exceeds the amount owed by 0.05/));
  it("another investor's reference cannot be re-pointed", () => expect(fundingAcceptanceError({ ...ok, conflictingReference: "4014-C1-ABC" })).toMatch(/another investor/));
  it("applied amount must equal the deposit", () => expect(fundingAcceptanceError({ ...ok, appliedCents: 90 })).toMatch(/must equal/));
});
