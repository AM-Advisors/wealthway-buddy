import { describe, it, expect } from "vitest";
import { defaultNextReview, validateRisk, isReviewOverdue } from "./bsa-profile";

describe("BSA profile rules", () => {
  it("high risk is reviewed again after 1 year", () => {
    expect(defaultNextReview("high", new Date("2026-10-30T00:00:00Z"))).toBe("2027-10-30");
  });
  it("low risk is reviewed again after 3 years", () => {
    expect(defaultNextReview("low", new Date("2026-10-30T00:00:00Z"))).toBe("2029-10-30");
  });
  it("a risk rating needs a reason", () => {
    expect(validateRisk("high", "")).not.toBeNull();
    expect(validateRisk("high", "PEP relative")).toBeNull();
  });
  it("past review dates are overdue", () => {
    expect(isReviewOverdue("2026-01-01", new Date("2026-10-30"))).toBe(true);
    expect(isReviewOverdue("2027-01-01", new Date("2026-10-30"))).toBe(false);
  });
});
