import { describe, expect, it } from "vitest";
import { eligibleParticipantInvitation, visibleParticipantAssignment } from "./participant-home-model";

const row = { email: "helper@example.com", role: "preparer", status: "invited" };
describe("assigned investments on the homepage", () => {
  it("includes the exact invited helper before their first visit", () => {
    expect(visibleParticipantAssignment(row, "helper@example.com")).toBe(true);
  });
  it("does not grant an owner, CC recipient or other login helper access", () => {
    expect(visibleParticipantAssignment(row, "owner@example.com")).toBe(false);
    expect(visibleParticipantAssignment({ ...row, role: "beneficial_owner" }, row.email)).toBe(false);
  });
  it("hides revoked assignments", () => {
    expect(visibleParticipantAssignment({ ...row, status: "removed" }, row.email)).toBe(false);
    expect(visibleParticipantAssignment({ ...row, removed_at: "2026-11-24" }, row.email)).toBe(false);
  });
});

describe("paperwork invitation account entry", () => {
  const invitation = { email: "joeg40@comcast.net", role: "contact", status: "invited", investor_onboardings: { stage: "verification" } };
  it("recognizes Joe’s exact invited contact email without making him a preparer", () => {
    expect(eligibleParticipantInvitation(invitation, "joeg40@comcast.net")).toBe(true);
    expect(eligibleParticipantInvitation(invitation, "pinklady55@comcast.net")).toBe(false);
  });
  it("recognizes an active preparer", () => {
    expect(eligibleParticipantInvitation({ ...invitation, role: "preparer", status: "active" }, invitation.email)).toBe(true);
  });
  it("rejects revoked, unknown-role and missing-investment assignments", () => {
    expect(eligibleParticipantInvitation({ ...invitation, status: "removed" }, invitation.email)).toBe(false);
    expect(eligibleParticipantInvitation({ ...invitation, removed_at: "2026-11-25" }, invitation.email)).toBe(false);
    expect(eligibleParticipantInvitation({ ...invitation, role: "beneficial_owner" }, invitation.email)).toBe(false);
    expect(eligibleParticipantInvitation({ ...invitation, investor_onboardings: null }, invitation.email)).toBe(false);
  });
  it("rejects removed, merged, declined and cancelled investments", () => {
    for (const investment of [{ stage: "verification", removed_at: "2026-11-25" }, { stage: "verification", merged_into_onboarding_id: "replacement" }, { stage: "declined" }, { stage: "cancelled" }]) {
      expect(eligibleParticipantInvitation({ ...invitation, investor_onboardings: investment }, invitation.email)).toBe(false);
    }
  });
});