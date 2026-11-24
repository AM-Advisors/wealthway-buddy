import { describe, expect, it } from "vitest";
import { normalizePeopleSearch, visiblePeopleTabs } from "./staff-nav";

describe("People & Access old links", () => {
  it("old Employees tab opens People filtered to employees", () => expect(normalizePeopleSearch("employees")).toEqual({ tab: "people", filter: "employees" }));
  it("old fund managers link keeps its filter", () => expect(normalizePeopleSearch("others", "fund_managers")).toEqual({ tab: "people", filter: "fund_managers" }));
  it("old invite link opens the invite form", () => expect(normalizePeopleSearch("access", "invite").section).toBe("invite"));
  it("old permission matrix opens Roles & permissions", () => expect(normalizePeopleSearch("access", "matrix").tab).toBe("roles"));
  it("old access audit opens Security & review", () => expect(normalizePeopleSearch("access", "audit").tab).toBe("security"));
  it("account managers see People only", () => expect(visiblePeopleTabs(["account_manager"]).map((t) => t.id)).toEqual(["people"]));
  it("admins see all three tabs", () => expect(visiblePeopleTabs(["admin"]).map((t) => t.id)).toEqual(["people", "roles", "security"]));
});
