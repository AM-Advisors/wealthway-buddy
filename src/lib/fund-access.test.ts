import { describe, expect, it } from "vitest";
import { allowsFundLevel, summarizeFundAccess } from "./fund-access";

const none = { staff: false, manager: false, clientMember: false, teamRole: null, teamSource: null };

describe("shared fund access", () => {
  it("a fund manager can manage the fund", () => expect(allowsFundLevel(summarizeFundAccess({ ...none, manager: true }), "manage")).toBe(true));
  it("an active client member can manage the client's fund", () => expect(allowsFundLevel(summarizeFundAccess({ ...none, clientMember: true }), "manage")).toBe(true));
  it("a listed team viewer can view but not manage", () => {
    const a = summarizeFundAccess({ ...none, teamRole: "fund_viewer", teamSource: "team_list" });
    expect([allowsFundLevel(a, "view"), allowsFundLevel(a, "manage")]).toEqual([true, false]);
  });
  it("someone on no list gets nothing", () => expect(summarizeFundAccess(none).canView).toBe(false));
  it("names every list that gave access", () => expect(summarizeFundAccess({ ...none, manager: true, teamRole: "fund_viewer", teamSource: "team_list" }).sources).toEqual(["fund_manager", "team_list"]));
  it("the manager level lets in this fund's own managers", () => expect(allowsFundLevel(summarizeFundAccess({ ...none, manager: true }), "manager")).toBe(true));
  it("the manager level lets in fund operations staff", () => expect(allowsFundLevel(summarizeFundAccess({ ...none, staff: true }), "manager")).toBe(true));
  it("the manager level does not let in client-wide members", () => expect(allowsFundLevel(summarizeFundAccess({ ...none, clientMember: true }), "manager")).toBe(false));
});

describe("fund's own lists without staff shortcut", () => {
  it("staff alone does not pass the membership-only answer", async () => {
    const { allowsFundMembership } = await import("./fund-access");
    expect(allowsFundMembership({ ...none, staff: true }, "manager")).toBe(false);
  });
  it("an exact fund manager passes the membership-only answer", async () => {
    const { allowsFundMembership } = await import("./fund-access");
    expect(allowsFundMembership({ ...none, manager: true }, "manager")).toBe(true);
  });
  it("a client member passes manage but not manager", async () => {
    const { allowsFundMembership } = await import("./fund-access");
    expect([allowsFundMembership({ ...none, clientMember: true }, "manage"), allowsFundMembership({ ...none, clientMember: true }, "manager")]).toEqual([true, false]);
  });
});
