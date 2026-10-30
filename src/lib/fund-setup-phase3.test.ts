import { describe, expect, it } from "vitest";
import { accountNameNeedsReview, bankInstructionsReleasable, bankingNotRequiredError, classChangeImpact, einTransitionError, entitySection, needsEinApplication, maskTail, validEin } from "./fund-setup-phase3";

describe("fund setup phase 3", () => {
  it("never requests SS-4 when an EIN already exists, regardless of an old obtain-EIN status", () => {
    expect(needsEinApplication(true)).toBe(false);
    expect(needsEinApplication(false)).toBe(true);
    expect(entitySection({ path: "harmonious", hasEin: true, hasEinLetter: true, status: "awaiting_signature", basicsComplete: true }).status).toBe("complete");
    expect(entitySection({ path: "harmonious", hasEin: true, hasEinLetter: false, status: "information_needed", basicsComplete: true }).next).toBe("Upload the IRS EIN letter or signed W-9");
  });
  it("releases only a current verified version", () => {
    expect(bankInstructionsReleasable([])).toBe(false);
    expect(bankInstructionsReleasable([{ version: 1, status: "pending_verification" } as any])).toBe(false);
    expect(bankInstructionsReleasable([{ version: 2, status: "pending_verification" } as any, { version: 1, status: "verified" } as any])).toBe(false);
    expect(bankInstructionsReleasable([{ version: 1, status: "verified" } as any])).toBe(true);
  });
  it("requires a reason for banking not required", () => {
    expect(bankingNotRequiredError({ reason: "", hasInvestments: false })).toBeTruthy();
  });
  it("flags account name mismatch and masks", () => {
    expect(accountNameNeedsReview("Acme Fund I, LLC", "ACME FUND I LLC")).toBe(false);
    expect(accountNameNeedsReview("John Smith", "Acme Fund I LLC")).toBe(true);
    expect(maskTail("123456789")).toContain("6789");
    expect(maskTail("123456789")).not.toContain("12345");
  });
  it("never fakes an EIN", () => {
    expect(validEin("12-3456789")).toBe(true);
    expect(validEin("123")).toBe(false);
    expect(einTransitionError(null, "ein_received")).toBeTruthy();
  });
  it("blocks class change after funding activity", () => {
    expect(classChangeImpact({ stage: "funding", applicableDocuments: 1, signedDocuments: 1, hasFundingActivity: true }).blocked).toBe(true);
    expect(classChangeImpact({ stage: "about_you", applicableDocuments: 0, signedDocuments: 0, hasFundingActivity: false }).blocked).toBe(false);
  });
  it("protects signed default terms from later exception-class reassignment", () => {
    expect(classChangeImpact({ stage: "signature", applicableDocuments: 1, signedDocuments: 1, hasFundingActivity: false }).blocked).toBe(true);
  });
});
