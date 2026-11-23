import { describe, expect, it } from "vitest";
import { fundRosterAccess } from "@/lib/investor-record-model";
import { hasFundTeamPermission, listedTeamManagesInvestors, listedTeamViewerRole } from "@/lib/fund-team-access";

const none = { isStaff: false, managesFund: false, teamRosterView: false, activeClientMember: false };

describe("fund investor roster access", () => {
  it("staff and exact-fund managers manage the roster", () => {
    expect(fundRosterAccess({ ...none, isStaff: true })).toBe("manage");
    expect(fundRosterAccess({ ...none, managesFund: true })).toBe("manage");
  });
  it("a listed fund team member with View fund sees the roster read-only", () => {
    const role = listedTeamViewerRole({ user_id: "brittany", removed_at: null, permissions: ["view", "investors", "documents"] }, "brittany");
    const teamRosterView = hasFundTeamPermission(role, "fund.roster.view");
    expect(fundRosterAccess({ ...none, teamRosterView })).toBe("view");
  });
  it("a removed team entry gives no roster access", () => {
    const role = listedTeamViewerRole({ user_id: "brittany", removed_at: "2026-01-01", permissions: ["view", "investors"] }, "brittany");
    expect(fundRosterAccess({ ...none, teamRosterView: hasFundTeamPermission(role, "fund.roster.view") })).toBeNull();
  });
  it("active company members of the owning client view read-only", () => {
    expect(fundRosterAccess({ ...none, activeClientMember: true })).toBe("view");
  });
  it("anyone else is refused", () => {
    expect(fundRosterAccess(none)).toBeNull();
  });
});

describe("Manage investors on the fund team", () => {
  it("a linked team entry with Manage investors may add and invite investors", () => {
    expect(listedTeamManagesInvestors({ user_id: "brittany", removed_at: null, permissions: ["view", "investors", "documents"] }, "brittany")).toBe(true);
  });
  it("View fund alone does not allow adding or inviting", () => {
    expect(listedTeamManagesInvestors({ user_id: "sam", removed_at: null, permissions: ["view", "documents"] }, "sam")).toBe(false);
  });
  it("a removed entry, or someone else's entry, does not allow it", () => {
    expect(listedTeamManagesInvestors({ user_id: "brittany", removed_at: "2026-01-01", permissions: ["investors"] }, "brittany")).toBe(false);
    expect(listedTeamManagesInvestors({ user_id: "brittany", removed_at: null, permissions: ["investors"] }, "someone-else")).toBe(false);
    expect(listedTeamManagesInvestors({ user_id: null, removed_at: null, permissions: ["investors"] }, "brittany")).toBe(false);
  });
});
