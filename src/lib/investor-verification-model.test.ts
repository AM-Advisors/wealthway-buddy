import { describe, it, expect } from "vitest";
import { canDecide, checkState, matchCount, noteRequired, reviewReason } from "./investor-verification-model";

describe("investor verification summary", () => {
  it("maps statuses", () => {
    expect(checkState("review")).toBe("needs_review");
    expect(checkState("under_review")).toBe("needs_review");
    expect(checkState("approved")).toBe("approved");
    expect(checkState("failed")).toBe("declined");
    expect(checkState(null)).toBe("pending");
  });
  it("actions only for undecided checks", () => {
    expect(canDecide("needs_review")).toBe(true);
    expect(canDecide("approved")).toBe(false);
  });
  it("approving a flagged result needs a reason", () => {
    expect(noteRequired("approved", "needs_review", 2)).toBe(true);
    expect(noteRequired("approved", "needs_review", 0)).toBe(false);
    expect(noteRequired("declined", "needs_review", 0)).toBe(true);
  });
  it("counts matches without details", () => {
    expect(matchCount([{ name: "x" }, { name: "y" }])).toBe(2);
    expect(reviewReason("aml", "needs_review", 2)).toBe("2 possible matches");
  });
});
