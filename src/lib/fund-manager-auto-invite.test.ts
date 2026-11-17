import { describe, expect, it } from "vitest";
import { autoInviteDecision } from "./fund-manager-auto-invite";

const base = { source: "team" as const, teamRole: "gp", email: "Jane@Example.com ", actorAuthorized: true, alreadyManager: false, accessRemoved: false };

describe("automatic fund manager invitations", () => {
  it("invites a Manager or GP on the fund's team", () => {
    expect(autoInviteDecision(base)).toEqual({ invite: true, email: "jane@example.com" });
    expect(autoInviteDecision({ ...base, teamRole: "manager" })).toEqual({ invite: true, email: "jane@example.com" });
  });
  it("invites a fund signer whatever their team role", () => {
    expect(autoInviteDecision({ ...base, source: "signer", teamRole: null })).toEqual({ invite: true, email: "jane@example.com" });
  });
  it("never invites other team roles such as counsel or members", () => {
    for (const teamRole of ["member", "counsel", "auditor", "accountant", "tax_preparer"]) {
      expect(autoInviteDecision({ ...base, teamRole })).toEqual({ invite: false, reason: "not_manager_role" });
    }
  });
  it("never invites Harmonious staff", () => {
    expect(autoInviteDecision({ ...base, email: "ops@harmonious.co" })).toEqual({ invite: false, reason: "harmonious_staff" });
  });
  it("needs a real email", () => {
    expect(autoInviteDecision({ ...base, email: "" })).toEqual({ invite: false, reason: "no_email" });
    expect(autoInviteDecision({ ...base, email: "not-an-email" })).toEqual({ invite: false, reason: "no_email" });
  });
  it("only an administrator, the fund's own manager or an authorized fund request can trigger it", () => {
    expect(autoInviteDecision({ ...base, actorAuthorized: false })).toEqual({ invite: false, reason: "not_authorized" });
  });
  it("does not email someone who already manages the fund", () => {
    expect(autoInviteDecision({ ...base, alreadyManager: true })).toEqual({ invite: false, reason: "already_manager" });
  });
  it("does not give back access that was removed", () => {
    expect(autoInviteDecision({ ...base, accessRemoved: true })).toEqual({ invite: false, reason: "access_removed" });
  });
});
