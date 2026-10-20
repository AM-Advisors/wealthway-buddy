import { describe, expect, it } from "vitest";
import { FUND_SETUP_FEE_CENTS, PRICE_APPROVER_ROLES, setupFeeItem } from "./fund-payments.server";

describe("new fund setup fee waiver", () => {
  it("charges $2,500 when not waived", () => {
    expect(FUND_SETUP_FEE_CENTS).toBe(250000);
    expect(setupFeeItem(false).cents).toBe(250000);
  });
  it("charges nothing when the client is waived", () => {
    expect(setupFeeItem(true).cents).toBe(0);
  });
  it("only CEO, CRO or Super Admin roles may waive", () => {
    expect(PRICE_APPROVER_ROLES).toContain("super_admin");
    expect(PRICE_APPROVER_ROLES).not.toContain("operations");
  });
});
