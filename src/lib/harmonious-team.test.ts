import { describe, expect, it } from "vitest";
import { DEFAULT_SALES_EMAIL, canManageRole, clientFacingContacts, defaultOperationsOwner, defaultSalesOwner, eligibleFor, isTeamBlocking, resolveTeam, teamFollowUp, type Assignment } from "@/lib/harmonious-team";
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
  it("McKay Pettit is the automatic Sales owner for new Clients", () => {
    expect(DEFAULT_SALES_EMAIL).toBe("mckay@harmonious.co");
    // The server seeds with McKay's id as the chosen owner; a chosen owner always wins.
    expect(defaultSalesOwner("me", ["sales"], "mckay-id")).toBe("mckay-id");
    expect(eligibleFor("sales", ["client_gp", "sales"])).toBe(true);
  });
  it("new Fund inherits all three", () => {
    expect(resolveTeam({ hasClient: true, client: all }).every((m) => m.source === "client")).toBe(true);
  });
  it("client change flows to every inheriting Fund", () => {
    const changed = all.map((a) => (a.team_role === "operations" ? { ...a, user_id: "morgan" } : a));
    expect(by(resolveTeam({ hasClient: true, client: changed }), "operations").userId).toBe("morgan");
  });
  it("one Client's team never affects another Client's Funds", () => {
    const a = resolveTeam({ hasClient: true, client: all });
    const b = resolveTeam({ hasClient: true, client: [{ team_role: "sales", user_id: "zed" }] });
    expect(by(a, "sales").userId).toBe("alex");
    expect(by(b, "sales").userId).toBe("zed");
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

import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("client-facing sales rep", () => {
  const team = [{ role: "sales", userId: "s", source: "client" }, { role: "account_manager", userId: "a", source: "client" }] as any;
  i2("hidden unless chosen", () => e2(clientFacingContacts(team).map((c) => c.role)).toEqual(["Account Manager"]));
  i2("shown when chosen", () => e2(clientFacingContacts(team, true).map((c) => c.role)).toEqual(["Sales Representative", "Account Manager"]));
});

describe("CEO on the Sales team", () => {
  it("a CEO can be a client's Sales contact, the same as a CRO", async () => {
    const { eligibleFor } = await import("@/lib/harmonious-team");
    expect(eligibleFor("sales", ["executive"])).toBe(true);
    expect(eligibleFor("sales", ["cro"])).toBe(true);
    expect(eligibleFor("sales", ["finance"])).toBe(false);
    expect(staffProfile(["executive"]).commercialOnly).toBe(false);
    expect(staffProfile(["cro"]).commercialOnly).toBe(true);
  });
});
