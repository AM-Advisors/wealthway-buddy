import { describe, expect, it } from "vitest";
import { isHarmoniousStaffEmail, HARMONIOUS_STAFF_FUND_TEAM_MESSAGE } from "./harmonious-staff";

describe("isHarmoniousStaffEmail", () => {
  it("flags @harmonious.co addresses in any case", () => {
    expect(isHarmoniousStaffEmail("alyssa@harmonious.co")).toBe(true);
    expect(isHarmoniousStaffEmail("  ALYSSA@Harmonious.CO ")).toBe(true);
  });

  it("allows client, investor and lookalike addresses", () => {
    expect(isHarmoniousStaffEmail("manager@clientfund.com")).toBe(false);
    expect(isHarmoniousStaffEmail("person@harmonious.co.evil.com")).toBe(false);
    expect(isHarmoniousStaffEmail("person@not-harmonious.co")).toBe(false);
    expect(isHarmoniousStaffEmail("harmonious.co@gmail.com")).toBe(false);
  });

  it("treats missing email as not staff", () => {
    expect(isHarmoniousStaffEmail(null)).toBe(false);
    expect(isHarmoniousStaffEmail(undefined)).toBe(false);
    expect(isHarmoniousStaffEmail("")).toBe(false);
  });

  it("explains the block in plain words", () => {
    expect(HARMONIOUS_STAFF_FUND_TEAM_MESSAGE).toContain("Harmonious staff");
  });
});
