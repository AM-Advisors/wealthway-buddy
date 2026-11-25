import { describe, it, expect } from "vitest";
import { shouldAutoMarkOutside } from "./prior-signed-documents.server";
describe("fund manager signed subscription upload", () => {
  it("marks signed outside the platform in the same step", () => {
    expect(shouldAutoMarkOutside({ kind: "subscription_agreement", role: "fund_manager", signedOnPlatform: false })).toBe(true);
  });
  it("does not mark when already signed on the platform", () => {
    expect(shouldAutoMarkOutside({ kind: "subscription_agreement", role: "fund_manager", signedOnPlatform: true })).toBe(false);
  });
  it("does not mark other document kinds", () => {
    expect(shouldAutoMarkOutside({ kind: "side_letter", role: "fund_manager", signedOnPlatform: false })).toBe(false);
  });
});
