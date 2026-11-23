import { describe, expect, it } from "vitest";
import { teamInviteDecision } from "./fund-team-invite";

describe("fund team sign-up invitations", () => {
  it("invites a view-only member with an email who has no account", () => {
    expect(teamInviteDecision({ teamRole: "member", email: "Ethan.Drum@laasy.com" })).toEqual({ invite: true, email: "ethan.drum@laasy.com", kind: "signup" });
  });
  it("does not invite the same member twice without an explicit resend", () => {
    expect(teamInviteDecision({ teamRole: "member", email: "a@b.co", invitedAt: "2026-11-23T15:00:00Z" })).toEqual({ invite: false, reason: "already_invited" });
    expect(teamInviteDecision({ teamRole: "member", email: "a@b.co", invitedAt: "2026-11-23T15:00:00Z", resend: true }).invite).toBe(true);
  });
  it("leaves managers to the manager invitation", () => {
    expect(teamInviteDecision({ teamRole: "manager", email: "a@b.co" })).toEqual({ invite: false, reason: "manager_role" });
  });
  it("skips Harmonious staff and people who already signed in", () => {
    expect(teamInviteDecision({ teamRole: "member", email: "x@harmonious.co" }).invite).toBe(false);
    expect(teamInviteDecision({ teamRole: "member", email: "a@b.co", userId: "u1" })).toEqual({ invite: false, reason: "has_account" });
  });
  it("emails someone with an account once when they are newly added", () => {
    expect(teamInviteDecision({ teamRole: "member", email: "a@b.co", userId: "u1", newlyAdded: true, actorId: "boss" })).toEqual({ invite: true, email: "a@b.co", kind: "access_notice" });
  });
  it("never emails an existing account on later edits, repeats or self-adds", () => {
    expect(teamInviteDecision({ teamRole: "member", email: "a@b.co", userId: "u1", actorId: "boss" })).toEqual({ invite: false, reason: "has_account" });
    expect(teamInviteDecision({ teamRole: "member", email: "a@b.co", userId: "u1", newlyAdded: true, invitedAt: "2026-11-23T15:00:00Z", actorId: "boss" }).invite).toBe(false);
    expect(teamInviteDecision({ teamRole: "member", email: "a@b.co", userId: "u1", newlyAdded: true, actorId: "u1" }).invite).toBe(false);
  });
});
