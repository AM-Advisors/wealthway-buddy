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
