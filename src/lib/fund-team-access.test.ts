import { describe, expect, it } from "vitest";
import {
  FUND_TEAM_PERMISSIONS,
  NEVER_GRANTABLE,
  grantRefusal,
  hasFundTeamPermission,
  isGrantLive,
} from "./fund-team-access";

const base = {
  granterIsFundManager: true,
  granterUserId: "u1",
  granterEmail: "m@x.co",
  granteeEmail: "a@x.co",
  granteeUserId: null,
  granteeIsInvestorInFund: false,
  role: "fund_viewer",
};

describe("fund team access", () => {
  it("never includes sensitive or authority permissions", () => {
    for (const perms of Object.values(FUND_TEAM_PERMISSIONS))
      for (const p of NEVER_GRANTABLE) expect(perms as readonly string[]).not.toContain(p);
  });
  it("viewer cannot prepare; assistant can", () => {
    expect(hasFundTeamPermission("fund_viewer", "fund.invitations.prepare")).toBe(false);
    expect(hasFundTeamPermission("fund_assistant", "fund.invitations.prepare")).toBe(true);
    expect(hasFundTeamPermission(null, "fund.overview.view")).toBe(false);
  });
  it("allows a valid grant", () => expect(grantRefusal(base)).toBeNull());
  it("refuses non-managers", () => expect(grantRefusal({ ...base, granterIsFundManager: false })).toMatch(/Fund Manager/));
  it("refuses escalation roles", () => expect(grantRefusal({ ...base, role: "fund_manager" })).toMatch(/Viewer or Assistant/));
  it("refuses self-grant", () => {
    expect(grantRefusal({ ...base, granteeEmail: "M@x.co" })).toMatch(/yourself/);
    expect(grantRefusal({ ...base, granteeUserId: "u1" })).toMatch(/yourself/);
  });
  it("refuses investors in the fund", () => expect(grantRefusal({ ...base, granteeIsInvestorInFund: true })).toMatch(/Investors/));
  it("expired or revoked grants are not live", () => {
    expect(isGrantLive({ status: "active", expires_at: null })).toBe(true);
    expect(isGrantLive({ status: "revoked", expires_at: null })).toBe(false);
    expect(isGrantLive({ status: "active", expires_at: "2000-01-01" })).toBe(false);
  });
});
