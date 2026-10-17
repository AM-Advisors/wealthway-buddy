import { describe, expect, it } from "vitest";
import { managerEditWindowOpen } from "./manager-edit-window";

describe("manager direct-edit window", () => {
  it("allows unsigned investors who have not sent capital", () => {
    expect(managerEditWindowOpen({ signed: false, fundingStatus: "not_funded" })).toBe(true);
    expect(managerEditWindowOpen({ signed: false, fundingStatus: "awaiting_wire" })).toBe(true);
  });
  it("requires review after any investor signature", () => {
    expect(managerEditWindowOpen({ signed: true, fundingStatus: "not_funded" })).toBe(false);
  });
  it("requires review once the investor reports capital sent", () => {
    expect(managerEditWindowOpen({ signed: false, reportedSent: true })).toBe(false);
  });
  it("requires review for capital received or reconciled", () => {
    for (const fundingStatus of ["processing", "partially_funded", "funded", "settled", "returned"]) {
      expect(managerEditWindowOpen({ signed: false, fundingStatus })).toBe(false);
    }
    expect(managerEditWindowOpen({ signed: false, fundedCents: 1 })).toBe(false);
  });
});