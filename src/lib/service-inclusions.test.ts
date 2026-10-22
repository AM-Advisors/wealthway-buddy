import { describe, expect, it } from "vitest";
import { HARMONIZED_SPV_INCLUDED, standardInclusions } from "@/lib/service-inclusions";
import { adminQuoteKey } from "@/lib/service-ladders";
import { SPV_TXN_KEY_PREFIX } from "@/lib/spv-transaction-pricing";

describe("standardInclusions", () => {
  it("Harmonized SPV raise lines carry the standard package", () => {
    const std = standardInclusions(`${SPV_TXN_KEY_PREFIX}band-1`);
    expect(std?.included).toEqual(HARMONIZED_SPV_INCLUDED);
    expect(std?.included.join(" ")).toContain("7 years of maintenance");
    expect(std?.included.join(" ")).toContain("Series LLC entity formed under the Harmonious Master");
    expect(std?.included.join(" ")).toContain("SS-4");
    expect(std?.included.join(" ")).toContain("Up to 20 investors onboarded");
    expect(std?.included.join(" ")).toContain("1 close");
    expect(std?.included.join(" ")).toContain("1st year of K-1s");
  });

  it("Harmonized SPV exclusions flag the extra-cost items", () => {
    const std = standardInclusions(`${SPV_TXN_KEY_PREFIX}band-1`);
    expect(std?.excluded.join(" ")).toContain("redlines");
    expect(std?.excluded.join(" ")).toContain("More than 20 investors");
    expect(std?.excluded.join(" ")).toContain("Additional closes");
    expect(std?.excluded.join(" ")).toContain("K-1s beyond the first year");
  });

  it("SaaS states that no services are included", () => {
    const std = standardInclusions(adminQuoteKey("SPV_ADMINISTRATION", "SAAS"));
    expect(std?.included.join(" ")).toContain("no Harmonious services are included");
    expect(std?.included.join(" ")).toContain("quarterly or annually");
  });

  it("Self Serve states the Operations inbox inclusion", () => {
    const std = standardInclusions(adminQuoteKey("FUND_ADMINISTRATION", "SELF_SERVE"));
    expect(std?.included.join(" ")).toContain("5-business-day response");
  });

  it("paid administration levels and unknown services get no prefill", () => {
    expect(standardInclusions(adminQuoteKey("SPV_ADMINISTRATION", "CORE"))).toBeNull();
    expect(standardInclusions("BOOKKEEPING")).toBeNull();
  });

  it("returned lists are copies, so editing a line never mutates the standard", () => {
    const a = standardInclusions(`${SPV_TXN_KEY_PREFIX}band-1`);
    a!.included.push("edited");
    expect(standardInclusions(`${SPV_TXN_KEY_PREFIX}band-1`)!.included).toEqual(HARMONIZED_SPV_INCLUDED);
  });
});
