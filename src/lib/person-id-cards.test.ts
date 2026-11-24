import { describe, expect, it } from "vitest";
import { blankOnlyFills, canOpenIdentity, kycAfterIdUpload } from "./person-id-cards";

describe("person identity access", () => {
  it("lets the exact fund's manager open full numbers", () => {
    expect(canOpenIdentity({ isStaff: false, managedOfferingIds: ["fund-a"] }, "fund-a")).toBe(true);
  });
  it("blocks another fund's manager", () => {
    expect(canOpenIdentity({ isStaff: false, managedOfferingIds: ["fund-b"] }, "fund-a")).toBe(false);
  });
  it("blocks team viewers and helpers who manage no fund", () => {
    expect(canOpenIdentity({ isStaff: false, managedOfferingIds: [] }, "fund-a")).toBe(false);
  });
  it("lets Harmonious staff open", () => {
    expect(canOpenIdentity({ isStaff: true, managedOfferingIds: [] }, "fund-a")).toBe(true);
  });
  it("paperwork never overwrites existing values", () => {
    expect(blankOnlyFills({ date_of_birth: "1970-01-01", phone: null }, { date_of_birth: "1980-02-02", phone: "555" })).toEqual({ phone: "555" });
  });
  it("an ID upload never approves KYC", () => {
    expect(kycAfterIdUpload("not_started")).toBe("not_started");
  });
});
