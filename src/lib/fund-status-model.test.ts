import { describe, expect, it } from "vitest";
import { canRequestStatusChange, fundAcceptsInvestments, prospectDocumentsVisible, reopenApprovalError } from "./fund-status-model";

describe("closed fund status", () => {
  it("a closed fund refuses new investments", () => {
    expect(fundAcceptsInvestments({ is_open: true, lifecycle_status: "closed" })).toBe(false);
  });
  it("an open, launched fund accepts investments", () => {
    expect(fundAcceptsInvestments({ is_open: true, lifecycle_status: "open" })).toBe(true);
  });
  it("a closed fund hides prospect documents", () => {
    expect(prospectDocumentsVisible({ lifecycle_status: "closed" })).toBe(false);
  });
  it("only managers or staff can close or request reopen", () => {
    expect(canRequestStatusChange({ isManager: false, isStaff: false })).toBe(false);
  });
  it("the requester cannot approve their own reopen", () => {
    expect(reopenApprovalError({ isManager: true, isSuperAdmin: false, isRequester: true, selfApproved: false })).not.toBeNull();
  });
  it("a non-manager cannot approve", () => {
    expect(reopenApprovalError({ isManager: false, isSuperAdmin: false, isRequester: false, selfApproved: false })).not.toBeNull();
  });
  it("another fund manager can approve", () => {
    expect(reopenApprovalError({ isManager: true, isSuperAdmin: false, isRequester: false, selfApproved: false })).toBeNull();
  });
  it("a Super Admin may self-approve only with a recorded reason", () => {
    expect(reopenApprovalError({ isManager: false, isSuperAdmin: true, isRequester: true, selfApproved: true })).toBeNull();
  });
});
