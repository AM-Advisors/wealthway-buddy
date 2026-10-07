import { describe, expect, it } from "vitest";
import { requestResponsibility, entitlementFor, missingFields, slaHours, SLA_PAUSED } from "./service-request-types";
import { requiredApprovers } from "./approval-types";

describe("service requests", () => {
  it("maps statuses to the six labels", () => {
    expect(requestResponsibility("SUBMITTED")).toBe("HARMONIOUS_HANDLING");
    expect(requestResponsibility("WAITING_ON_CLIENT")).toBe("CLIENT_INFORMATION_REQUIRED");
    expect(requestResponsibility("READY_FOR_APPROVAL")).toBe("CLIENT_APPROVAL_REQUIRED");
    expect(requestResponsibility("WAITING_ON_INVESTOR")).toBe("WAITING_ON_INVESTOR");
    expect(requestResponsibility("WAITING_ON_THIRD_PARTY")).toBe("WAITING_ON_THIRD_PARTY");
    expect(requestResponsibility("COMPLETED")).toBe("COMPLETED");
    expect(SLA_PAUSED.has("WAITING_ON_CLIENT") && !SLA_PAUSED.has("IN_PROGRESS")).toBe(true);
  });
  it("entitlement never blocks, flags review", () => {
    expect(entitlementFor("CAPITAL_CALL", new Set(["CAPITAL_CALL_ADMIN"]))).toBe("INCLUDED");
    expect(entitlementFor("TAX", new Set(["CAPITAL_CALL_ADMIN"]))).toBe("REVIEW_REQUIRED");
    expect(entitlementFor("OTHER", new Set())).toBe("INCLUDED");
  });
  it("dynamic forms only require what's needed; SLA by level", () => {
    expect(missingFields("CAPITAL_CALL", { amount: "100000", purpose: "Follow-on" })).toEqual(["Desired funding deadline"]);
    expect(slaHours("WHITE_GLOVE")).toBe(24);
    expect(slaHours("INSTITUTIONAL", "8 business hours")).toBe(8);
  });
  it("high-risk approvals need two approvers at thresholds", () => {
    expect(requiredApprovers("PAYMENT", 10)).toBe(2);
    expect(requiredApprovers("DISTRIBUTION", 450000)).toBe(2);
    expect(requiredApprovers("DISTRIBUTION", 50000)).toBe(1);
    expect(requiredApprovers("NAV", 18_000_000)).toBe(1);
  });
});
