import { describe, it, expect } from "vitest";
import { managerFormationFields, timelineText, validateAuthorization, validateCost } from "./fund-formation";
import { checkTransition } from "./fund-services";

describe("fund formation record", () => {
  it("managers see only status-level formation fields", () => {
    const v = managerFormationFields({ state: "DE", entityType: "LLC", confirmationNumber: "123", notes: "x", registeredAgent: "y", nameCheckResult: "Available" });
    expect(v).toEqual({ state: "DE", entityType: "LLC" });
  });
  it("hides internal notes and discrepancy detail from managers", () => {
    const e = { at: "", event: "discrepancy_opened", from: null, to: null, managerVisible: true, note: "secret" };
    expect(timelineText(e, (s) => s, true)).toBe("Harmonious is confirming a detail");
    expect(timelineText({ ...e, event: "status_changed", to: "submitted" }, () => "Submitted", true)).not.toMatch(/secret/);
  });
  it("formation can't be submitted without a client authorization", () => {
    const t = { kind: "formation" as const, from: "reviewed" as const, to: "submitted" as const, actorId: "b", preparedBy: "a", fields: { submittedOn: "2026-01-01" } };
    expect(checkTransition({ ...t, hasFormationAuthorization: false })).toMatch(/authorization/);
    expect(checkTransition({ ...t, hasFormationAuthorization: true })).toBeNull();
  });
  it("validates authorization and costs", () => {
    expect(validateAuthorization({ authorizationText: "short", authorizedOn: "2026-01-01" })).toMatch(/wording/);
    expect(validateAuthorization({ authorizationText: "I authorize Harmonious to form the entity.", authorizedOn: "2999-01-01" })).toMatch(/future/);
    expect(validateCost({ stateFees: -1, providerCost: 0, customerTotal: 0 })).toMatch(/zero/);
  });
});
