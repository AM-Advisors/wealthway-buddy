import { describe, expect, it } from "vitest";
import { alertTitle } from "@/lib/approval-alerts.server";
describe("approval alerts", () => {
  it("labels approvals and reviews", () => {
    expect(alertTitle({ title: "Fund launch", requiredAction: "approve" })).toBe("Approval needed: Fund launch");
    expect(alertTitle({ title: "KYC", requiredAction: "review" })).toBe("Review needed: KYC");
  });
});
