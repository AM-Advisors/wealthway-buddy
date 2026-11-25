import { describe, expect, it } from "vitest";
import { isExactFundClientPreview } from "./view-as";
import { requiredEntitlement } from "./saas-order-model";

describe("Client perspective plan presentation", () => {
  const preview = { perspective: "fund_manager", offeringId: "fictional-fund" };
  it("lets a validated staff preview reach its exact fund without a personal fund purchase", () => {
    expect(requiredEntitlement("/manager/fund/fictional-fund")).toBe("fund_platform");
    expect(isExactFundClientPreview("/manager/fund/fictional-fund", true, preview)).toBe(true);
    expect(isExactFundClientPreview("/manager/fund/fictional-fund/documents", true, preview)).toBe(true);
  });
  it("does not waive purchases for ordinary clients, other funds or unrelated services", () => {
    expect(isExactFundClientPreview("/manager/fund/fictional-fund", false, preview)).toBe(false);
    expect(isExactFundClientPreview("/manager/fund/other-fund", true, preview)).toBe(false);
    expect(isExactFundClientPreview("/manager/fund/fictional-fund-copy", true, preview)).toBe(false);
    expect(isExactFundClientPreview("/client/cap-table", true, preview)).toBe(false);
  });
  it("does not treat an absent or investor perspective as a fund preview", () => {
    expect(isExactFundClientPreview("/manager/fund/fictional-fund", true, null)).toBe(false);
    expect(isExactFundClientPreview("/manager/fund/fictional-fund", true, { ...preview, perspective: "investor" })).toBe(false);
  });
});