import { describe, expect, it } from "vitest";
import { canAssignParticipant, PREPARER_CAN } from "./onboarding-participants-model";

describe("assigned preparers", () => {
  it("cannot sign, pass verification, approve funding or change the amount", () => {
    expect(PREPARER_CAN.sign).toBe(false);
    expect(PREPARER_CAN.passVerification).toBe(false);
    expect(PREPARER_CAN.approveFunding).toBe(false);
    expect(PREPARER_CAN.changeAmount).toBe(false);
  });
  it("only Harmonious, the fund's manager or the investor can assign", () => {
    expect(canAssignParticipant("manager")).toBe(true);
    expect(canAssignParticipant("investor")).toBe(true);
    expect(canAssignParticipant(null)).toBe(false);
  });
});

import { allowsMultipleContacts as amc, participantRoleLabel as prl } from "./onboarding-participants-model";
describe("points of contact", () => {
  it("only joint, entity and trust investments get extra contacts", () => {
    expect(amc("individual")).toBe(false);
    expect(amc("ira")).toBe(false);
    expect(amc("joint")).toBe(true);
    expect(amc("llc")).toBe(true);
    expect(amc("trust")).toBe(true);
  });
  it("contacts are labeled view only", () => { expect(prl("contact")).toBe("Point of contact (view only)"); });
});
