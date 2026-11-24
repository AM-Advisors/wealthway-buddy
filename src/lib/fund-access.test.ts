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
});
