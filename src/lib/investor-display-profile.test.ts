import { describe, it, expect } from "vitest";
import { mergeInvestorDisplayProfile } from "./investor-display-profile";

describe("mergeInvestorDisplayProfile", () => {
  it("fills blank signup fields from the verified person", () => {
    const r = mergeInvestorDisplayProfile({ phone: null }, { phone: "555", date_of_birth: "1980-01-01", city: "Austin", address_line1: "1 Main" }, null);
    expect(r["phone"]).toBe("555");
    expect(r["date_of_birth"]).toBe("1980-01-01");
    expect(r["city"]).toBe("Austin");
  });
  it("keeps existing signup values", () => {
    const r = mergeInvestorDisplayProfile({ phone: "111" }, { phone: "555" }, null);
    expect(r["phone"]).toBe("111");
  });
});
