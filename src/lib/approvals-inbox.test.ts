import { describe, expect, it } from "vitest";
import { isApprovalItem, isStalledApproval, matchesSearch, sortOldestFirst, waitingDays } from "@/lib/approvals-inbox";

const now = new Date("2026-10-30T12:00:00Z");

describe("approvals inbox", () => {
  it("includes only review and approve items", () => {
    expect(isApprovalItem({ requiredAction: "approve" })).toBe(true);
    expect(isApprovalItem({ requiredAction: "review" })).toBe(true);
    expect(isApprovalItem({ requiredAction: "follow_up" })).toBe(false);
  });
  it("flags an approval as stalled at 3 days, not 2", () => {
    expect(isStalledApproval("2026-10-27T11:00:00Z", now)).toBe(true);
    expect(isStalledApproval("2026-10-28T13:00:00Z", now)).toBe(false);
    expect(waitingDays("2026-10-27T11:00:00Z", now)).toBe(3);
  });
  it("searches fund and investor names", () => {
    const i = { id: "1", title: "Accreditation proof", requiredAction: "review", fundName: "ROAS Hedge LP", investorName: "Doug Mangrum" };
    expect(matchesSearch(i, "roas")).toBe(true);
    expect(matchesSearch(i, "doug")).toBe(true);
    expect(matchesSearch(i, "erebor")).toBe(false);
  });
  it("lists the oldest approval first", () => {
    const out = sortOldestFirst([
      { id: "new", title: "", requiredAction: "approve", at: "2026-10-29T00:00:00Z" },
      { id: "old", title: "", requiredAction: "approve", at: "2026-10-01T00:00:00Z" },
    ]);
    expect(out[0]!.id).toBe("old");
  });
});

import { approvalCategory } from "./approvals-inbox";
describe("approvalCategory", () => {
  it("puts ID and investor checks under investor details", () => { expect(approvalCategory("onboarding.kyc")).toBe("investor"); });
  it("puts document reviews under signed documents", () => { expect(approvalCategory("documents.review")).toBe("documents"); });
  it("puts fund requests under fund setup", () => { expect(approvalCategory("funds.request")).toBe("fund"); });
  it("leaves money items in everything else", () => { expect(approvalCategory("capital.call")).toBe("other"); });
});
