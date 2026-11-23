import { describe, expect, it } from "vitest";
import { teamInviteDecision } from "./fund-team-invite";

describe("fund team sign-up invitations", () => {
  it("invites a view-only member with an email who has no account", () => {
    expect(teamInviteDecision({ teamRole: "member", email: "Ethan.Drum@laasy.com" })).toEqual({ invite: true, email: "ethan.drum@laasy.com" });
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
});
