import { describe, expect, it } from "vitest";
import { bankComplete, einComplete, fieldSectionComplete, formatEin, validateBankEntry } from "@/lib/fund-setup-complete";

describe("fund setup boxes", () => {
  it("EIN needs both the number and the IRS letter", () => {
    expect(einComplete({ status: "recorded", hasLetter: false })).toBe(false);
    expect(einComplete({ status: "recorded", hasLetter: true })).toBe(true);
    expect(einComplete({ status: "in_review", hasLetter: true })).toBe(false);
    expect(formatEin("123456789")).toBe("12-3456789");
  });
  it("banking needs bank name, account and the bank letter", () => {
    expect(bankComplete({ bankName: "Mercury", accountMasked: "••••1234", hasLetter: true })).toBe(true);
    expect(bankComplete({ bankName: "Mercury", accountMasked: "••••1234", hasLetter: false })).toBe(false);
  });
  it("a manager-signed W-9 substitutes for the IRS letter but not the recorded EIN", () => {
    expect(einComplete({ status: "recorded", hasLetter: false, hasSignedW9: true })).toBe(true);
    expect(einComplete({ status: "not_recorded", hasLetter: false, hasSignedW9: true })).toBe(false);
    expect(einComplete({ status: "in_review", hasLetter: false, hasSignedW9: true })).toBe(false);
    expect(einComplete({ status: "recorded", hasLetter: false, hasSignedW9: false })).toBe(false);
  });
  it("full account and routing numbers must be typed twice and match", () => {
    const ok = { bankName: "Mercury", accountName: "Fund LLC", account: "123456789", account2: "123456789", routing: "021000021", routing2: "021000021" };
    expect(validateBankEntry(ok)).toBeNull();
    expect(validateBankEntry({ ...ok, account2: "1" })).toMatch(/don't match/);
    expect(validateBankEntry({ ...ok, routing: "12", routing2: "12" })).toMatch(/9 digits/);
  });
  it("a section with unsaved edits is never shown as complete", () => {
    expect(fieldSectionComplete(["a"], { a: "x" }, false)).toBe(true);
    expect(fieldSectionComplete(["a"], { a: "x" }, true)).toBe(false);
    expect(fieldSectionComplete(["a"], {}, false)).toBe(false);
  });
});
