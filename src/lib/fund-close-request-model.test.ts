import { describe, expect, it } from "vitest";

import { canFinalizeCloseRequest, closeStatusForIntent } from "./fund-close-request-model";

describe("fund close preparation", () => {
  it("saves details as a draft without sending them to review", () => {
    expect(closeStatusForIntent("draft")).toBe("draft");
  });

  it("uses a separate explicit submission to start review", () => {
    expect(closeStatusForIntent("submit")).toBe("submitted");
  });

  it("never allows a draft to be finalized", () => {
    expect(canFinalizeCloseRequest({ isStaff: true, status: "draft", filingStatuses: ["filed"] })).toBe(false);
  });

  it("keeps finalization staff-only even after approval and recorded filings", () => {
    expect(canFinalizeCloseRequest({ isStaff: false, status: "approved", filingStatuses: ["filed"] })).toBe(false);
    expect(canFinalizeCloseRequest({ isStaff: true, status: "approved", filingStatuses: ["filed", "not_required"] })).toBe(true);
  });

  it("does not finalize while a filing is only prepared", () => {
    expect(canFinalizeCloseRequest({ isStaff: true, status: "approved", filingStatuses: ["prepared"] })).toBe(false);
  });
});
