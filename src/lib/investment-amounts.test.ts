import { describe, expect, it } from "vitest";
import { investmentAmountCents, isLiveInvestment, reconciledFundedCents } from "./investment-amounts";

describe("investment amounts", () => {
  it("prefers the accepted amount, then commitment, then requested", () => {
    expect(investmentAmountCents({ accepted_amount_cents: 100, commitment_amount_cents: 200, requested_amount_cents: 300 })).toBe(100);
    expect(investmentAmountCents({ commitment_amount_cents: 200, requested_amount_cents: 300 })).toBe(200);
    expect(investmentAmountCents({ requested_amount_cents: 300 })).toBe(300);
    expect(investmentAmountCents({})).toBeNull();
  });
  it("counts funded money only when reconciled", () => {
    expect(reconciledFundedCents({ funded_amount_cents: 500, funding_status: "funded" })).toBe(500);
    expect(reconciledFundedCents({ funded_amount_cents: 500, funding_status: "received" })).toBe(0);
    expect(reconciledFundedCents({ requested_amount_cents: 500, funding_status: "funded" })).toBe(0);
  });
  it("excludes removed and merged investments", () => {
    expect(isLiveInvestment({})).toBe(true);
    expect(isLiveInvestment({ removed_at: "2026-11-01" })).toBe(false);
    expect(isLiveInvestment({ merged_into_onboarding_id: "x" })).toBe(false);
  });
});

import { setupDisplay } from "./fund-launch-summary";
describe("setup wording", () => {
  it("shows 'Already operating' instead of a low % when investors are closed or funded", () => {
    expect(setupDisplay(26, 3).text).toBe("Already operating · setup items to tidy");
    expect(setupDisplay(26, 0).text).toBe("26%");
    expect(setupDisplay(100, 3).text).toBe("100%");
  });
});
