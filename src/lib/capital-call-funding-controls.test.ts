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

import { splitReceipt, creditDispositionError, LARGE_CREDIT_REVIEW_CENTS } from "./capital-calls-model";
describe("investor credit / overpayment (permanent)", () => {
  const base = { appliedCents: 30_005_000, transactionCents: 30_005_000, outstandingCents: 30_000_000, acceptFundsBlocks: [] as string[] };
  it("overpayment without explicit disposition is refused", () => expect(fundingAcceptanceError(base)).toMatch(/exceeds/));
  it("overpayment with hold-as-credit is accepted", () => expect(fundingAcceptanceError({ ...base, holdExcessAsCredit: true })).toBeNull());
  it("Okafor split: $300,000 contribution + $50 credit = $300,050", () => {
    const s = splitReceipt(30_005_000, 30_000_000);
    expect(s).toMatchObject({ contributionCents: 30_000_000, excessCents: 5_000, overpaymentDetected: true, initialStatus: "unapplied" });
    expect(s.contributionCents + s.excessCents).toBe(30_005_000);
  });
  it("NAV effect of the credit is zero (cash +50, liability +50)", () => { const s = splitReceipt(30_005_000, 30_000_000); expect(s.excessCents - s.excessCents).toBe(0); });
  it("exact payment creates no credit", () => expect(splitReceipt(100, 100)).toMatchObject({ excessCents: 0, overpaymentDetected: false }));
  it("partial payment creates no credit", () => expect(splitReceipt(40, 100)).toMatchObject({ contributionCents: 40, excessCents: 0 }));
  it("large overpayment is held for review", () => expect(splitReceipt(100 + LARGE_CREDIT_REVIEW_CENTS + 1, 100).initialStatus).toBe("held_for_review"));
  it("nothing owed: cash cannot become a credit against this obligation", () => expect(fundingAcceptanceError({ ...base, outstandingCents: 0, holdExcessAsCredit: true })).toMatch(/Nothing is owed/));
  const d = { kind: "apply_to_obligation" as const, amountCents: 5_000, balanceCents: 5_000, creditOfferingId: "f", creditPositionId: "okafor", targetOfferingId: "f", targetPositionId: "okafor", obligationOutstandingCents: 5_000, preparedBy: "a", approvedBy: "b", status: "available_credit" };
  it("valid same-investor application allowed", () => expect(creditDispositionError(d)).toBeNull());
  it("over-disposition refused (cannot go negative)", () => expect(creditDispositionError({ ...d, amountCents: 5_001 })).toMatch(/negative/));
  it("wrong investor refused", () => expect(creditDispositionError({ ...d, targetPositionId: "atlas" })).toMatch(/another/));
  it("wrong fund refused", () => expect(creditDispositionError({ ...d, targetOfferingId: "g" })).toMatch(/fund/));
  it("no obligation refused", () => expect(creditDispositionError({ ...d, obligationOutstandingCents: 0 })).toMatch(/obligation/));
  it("refund needs verified payout destination", () => expect(creditDispositionError({ ...d, kind: "refund", payoutDestinationVerified: false })).toMatch(/verified payout/));
  it("self-approval refused", () => expect(creditDispositionError({ ...d, approvedBy: "a" })).toMatch(/second person/));
  it("held-for-review credit cannot be disposed", () => expect(creditDispositionError({ ...d, status: "held_for_review" })).toMatch(/review/));
});
