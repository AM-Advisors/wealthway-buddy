import { describe, expect, it } from "vitest";
import { parseWireReleaseState, wireReleaseBlocker, wireReleaseLabel } from "./wire-release";
import { investmentAttentionStep } from "./attention-investment";

const base = { latestVersion: 1, verified: true, bankingStatus: "account_active", released: true, releasedVersion: 1 };

describe("wire release rule", () => {
  it("is available only when verified, active and released for the current version", () => {
    expect(parseWireReleaseState(base).available).toBe(true);
  });
  it("is not available before the release button is clicked", () => {
    expect(parseWireReleaseState({ ...base, released: false }).available).toBe(false);
  });
  it("is not available while the account is not active", () => {
    const s = parseWireReleaseState({ ...base, bankingStatus: "application" });
    expect(s.available).toBe(false);
    expect(wireReleaseBlocker(s)).toBe("The fund's bank account isn't marked active yet.");
  });
  it("locks again when new bank details replace the released version", () => {
    const s = parseWireReleaseState({ ...base, latestVersion: 2, verified: false });
    expect(s.available).toBe(false);
    expect(wireReleaseLabel(s)).toBe("Awaiting verification");
  });
  it("needs a fresh release after a new version is verified", () => {
    expect(parseWireReleaseState({ ...base, latestVersion: 2 }).available).toBe(false);
  });
  it("shows verified-not-released separately from released", () => {
    expect(wireReleaseLabel(parseWireReleaseState({ ...base, released: false }))).toBe("Verified, not released");
  });
});

describe("investor to-do after approval", () => {
  const row = { id: "x", stage: "awaiting_funds", approved_to_fund_at: "2026-10-21" };
  it("does not say instructions are ready before banking is released", () => {
    expect(investmentAttentionStep({ ...row, instructions_available: false })?.waiting).toBe(true);
  });
  it("says instructions are ready once released", () => {
    expect(investmentAttentionStep({ ...row, instructions_available: true })?.status).toBe("Funding instructions are ready. Open Fund to send your investment.");
  });
});
