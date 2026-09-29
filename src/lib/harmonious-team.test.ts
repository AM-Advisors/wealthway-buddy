import { describe, expect, it } from "vitest";
import { canManageRole, clientFacingContacts, defaultOperationsOwner, defaultSalesOwner, eligibleFor, isTeamBlocking, resolveTeam, teamFollowUp, type Assignment } from "@/lib/harmonious-team";
import { staffProfile } from "@/lib/harmonious-staff";

const all: Assignment[] = [
  { team_role: "sales", user_id: "alex" },
  { team_role: "account_manager", user_id: "taylor" },
  { team_role: "operations", user_id: "jordan" },
];
const by = (t: ReturnType<typeof resolveTeam>, r: string) => t.find((m) => m.role === r)!;

describe("Harmonious Team", () => {
  it("client with all three assignments", () => {
    const t = resolveTeam({ hasClient: true, client: all });
    expect(t.map((m) => m.userId)).toEqual(["alex", "taylor", "jordan"]);
    expect(teamFollowUp(t)).toBeNull();
  });
  it("client with none shows Team Assignment Needed and never blocks", () => {
    const t = resolveTeam({ hasClient: true, client: [] });
    expect(teamFollowUp(t)).toBe("Team Assignment Needed");
    expect(isTeamBlocking(t)).toBe(false);
  });
  it("Sales user defaults to themselves when creating a Client", () => {
    expect(defaultSalesOwner("me", ["sales"])).toBe("me");
    expect(defaultSalesOwner("me", ["operations"])).toBeNull();
    expect(defaultSalesOwner("me", ["sales"], "other")).toBe("other");
  });
  it("new Fund inherits all three", () => {
    expect(resolveTeam({ hasClient: true, client: all, overrides: [] }).every((m) => m.source === "client")).toBe(true);
  });
  it("client change flows to inheriting Fund; override remains", () => {
    const changed = all.map((a) => (a.team_role === "operations" ? { ...a, user_id: "morgan" } : a));
    expect(by(resolveTeam({ hasClient: true, client: changed }), "operations").userId).toBe("morgan");
    const withOverride = resolveTeam({ hasClient: true, client: changed, overrides: [{ team_role: "operations", user_id: "sam" }] });
    expect(by(withOverride, "operations")).toEqual({ role: "operations", userId: "sam", source: "fund_override" });
  });
  it("reset to Client Assignment and one Fund's override doesn't affect another", () => {
    const a = resolveTeam({ hasClient: true, client: all, overrides: [{ team_role: "sales", user_id: "zed" }] });
    const b = resolveTeam({ hasClient: true, client: all, overrides: [] });
    expect(by(a, "sales").userId).toBe("zed");
    expect(by(b, "sales").userId).toBe("alex");
  });
  it("existing Fund without Client remains functional", () => {
    const t = resolveTeam({ hasClient: false, client: [] });
    expect(teamFollowUp(t)).toBe("No Client Team Available");
    expect(isTeamBlocking(t)).toBe(false);
  });
  it("assignment never changes authorization", () => {
    expect(staffProfile(["sales"]).operationsAccess).toBe(false);
    expect(staffProfile(["sales"]).commercialOnly).toBe(true);
    expect(staffProfile(["operations"]).superUser).toBe(false);
    expect(canManageRole("sales", ["operations"])).toBe(false);
    expect(canManageRole("operations", ["sales"])).toBe(false);
    expect(canManageRole("operations", ["super_admin"])).toBe(true);
  });
  it("eligibility follows existing staff roles", () => {
    expect(eligibleFor("sales", ["sales_management"])).toBe(true);
    expect(eligibleFor("sales", ["operations"])).toBe(false);
    expect(eligibleFor("operations", ["sales"])).toBe(false);
    expect(eligibleFor("account_manager", ["client_success"])).toBe(true);
    expect(eligibleFor("account_manager", [])).toBe(false);
  });
  it("routing and client-facing contacts", () => {
    const t = resolveTeam({ hasClient: true, client: all });
    expect(defaultOperationsOwner(t)).toBe("jordan");
    expect(clientFacingContacts(t).map((c) => c.role)).toEqual(["Account Manager", "Operations Contact"]);
  });
});
