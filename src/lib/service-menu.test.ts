import { describe, expect, it } from "vitest";
import { filterByServiceMenu, resolveServiceMenu, type ServiceMenuFacts } from "./service-menu";

const none: ServiceMenuFacts = { staff: false, selections: [], hasWealthRecords: false, hasInvestorCards: false, clientServiceKeys: [], reportCardsCoverage: false, overrides: {} };
const investorMenu = [{ url: "/home" }, { url: "/my-portfolio" }, { url: "/wealth" }, { url: "/investor-reporting" }, { url: "/investor-report-cards" }, { url: "/tax" }];

describe("optional services in the menu", () => {
  it("someone without Wealth or Report Cards does not see them", () => {
    expect(filterByServiceMenu(investorMenu, resolveServiceMenu(none)).map((l) => l.url)).toEqual(["/home", "/my-portfolio", "/investor-reporting", "/tax"]);
  });
  it("links stay hidden until the services are known", () => {
    expect(filterByServiceMenu([{ url: "/wealth" }, { url: "/manager/report-cards" }, { url: "/home" }], null)).toEqual([{ url: "/home" }]);
  });
  it("Report Cards switched on for their fund shows Report Cards only", () => {
    expect(resolveServiceMenu({ ...none, reportCardsCoverage: true })).toEqual({ wealth: false, reportCards: true });
  });
  it("a selected personal Portfolio shows Wealth & services", () => {
    expect(resolveServiceMenu({ ...none, selections: [{ offering_id: null, services: ["portfolio"], created_at: "2026-01-01" }] }).wealth).toBe(true);
  });
  it("a later empty selection removes the service", () => {
    const m = resolveServiceMenu({ ...none, selections: [
      { offering_id: null, services: ["portfolio", "report_cards"], created_at: "2026-01-01" },
      { offering_id: null, services: [], created_at: "2026-02-01" },
    ] });
    expect(m).toEqual({ wealth: false, reportCards: false });
  });
  it("Harmonious staff always see both", () => {
    expect(resolveServiceMenu({ ...none, staff: true })).toEqual({ wealth: true, reportCards: true });
  });
  it("a staff switch turned on shows the service", () => {
    expect(resolveServiceMenu({ ...none, overrides: { wealth: true } }).wealth).toBe(true);
  });
});
