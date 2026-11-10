import { describe, it, expect } from "vitest";
import { outsideReportApprovalError } from "@/lib/account-kyc-model";

describe("outside identity report approval", () => {
  it("a different reviewer can approve", () => {
    expect(outsideReportApprovalError({ addedBy: "a", deciderId: "b", isSuperAdmin: false, note: null })).toBeNull();
  });
  it("the person who added the report can't approve it", () => {
    expect(outsideReportApprovalError({ addedBy: "a", deciderId: "a", isSuperAdmin: false, note: "looks good" })).toMatch(/Someone other than/);
  });
  it("a Super Admin may approve their own only with a reason", () => {
    expect(outsideReportApprovalError({ addedBy: "a", deciderId: "a", isSuperAdmin: true, note: "" })).toMatch(/Add a reason/);
    expect(outsideReportApprovalError({ addedBy: "a", deciderId: "a", isSuperAdmin: true, note: "Verified in prior system on 10/1" })).toBeNull();
  });
});
