import { describe, expect, it } from "vitest";
import { visibleParticipantAssignment } from "./participant-home-model";

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