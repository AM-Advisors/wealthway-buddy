import { describe, it, expect } from "vitest";
import { applyLoginChecks } from "./verification-status";

describe("login identity check drives ID status", () => {
  it("passed login check shows ID approved even when investment copy is pending", () => {
    const m = applyLoginChecks(new Map([["u", { kyc: "pending", aml: "approved" }]]), [{ user_id: "u", status: "approved" }]);
    expect(m.get("u")).toEqual({ kyc: "approved", aml: "approved" });
  });
  it("newest login check wins and screening is unchanged", () => {
    const m = applyLoginChecks(new Map([["u", { kyc: "approved", aml: "review" }]]), [{ user_id: "u", status: "declined" }, { user_id: "u", status: "approved" }]);
    expect(m.get("u")).toEqual({ kyc: "declined", aml: "review" });
  });
  it("unstarted login check keeps the person result", () => {
    const m = applyLoginChecks(new Map([["u", { kyc: "approved", aml: null }]]), [{ user_id: "u", status: "not_started" }]);
    expect(m.get("u")?.kyc).toBe("approved");
  });
});
