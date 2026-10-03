import { describe, expect, it } from "vitest";
import { assignableRoles, assignmentProblem, seesWholeTeam } from "@/lib/staff-role-hierarchy";

describe("staff role hierarchy", () => {
  it("super admin assigns anything", () => expect(assignableRoles(["super_admin"])).toContain("super_admin"));
  it("CEO cannot assign super admin but can assign CEO", () => {
    const r = assignableRoles(["executive"]);
    expect(r).not.toContain("super_admin");
    expect(r).toContain("executive");
    expect(r).toContain("cro");
  });
  it("CRO assigns below only", () => expect(assignableRoles(["cro"])).toEqual(["sales_management", "sales", "account_manager"]));
  it("sales mgmt assigns sales and AM", () => expect(assignableRoles(["sales_management"])).toEqual(["sales", "account_manager"]));
  it("sales assigns nothing", () => expect(assignableRoles(["sales"])).toEqual([]));
  it("blocks self changes and last super admin", () => {
    const base = { actorId: "a", actorRoles: ["super_admin"], targetId: "b", role: "super_admin", action: "revoke" as const, superAdminCount: 1 };
    expect(assignmentProblem(base)).toMatch(/last/);
    expect(assignmentProblem({ ...base, targetId: "a" })).toMatch(/own/);
    expect(assignmentProblem({ ...base, superAdminCount: 2 })).toBeNull();
  });
  it("team visibility", () => {
    expect(seesWholeTeam(["sales"])).toBe(false);
    expect(seesWholeTeam(["cro"])).toBe(true);
  });
});
