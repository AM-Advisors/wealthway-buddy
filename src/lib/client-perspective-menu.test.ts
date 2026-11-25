import { describe, expect, it } from "vitest";
import { clientPerspectiveDestination, clientPerspectiveLinks, usesClientPerspectiveMenu, type ClientPerspectiveMenu } from "./client-perspective-menu";

const menu: ClientPerspectiveMenu = { perspective: "fund_manager", offeringId: "fictional-fund", entitlements: ["fund_platform"], hiddenTabs: [], services: { wealth: false, reportCards: false }, hasCapTable: false };
describe("Client perspective menu", () => {
  it("keeps service links in read-only preview and fund Home on the canonical fund", () => {
    expect(clientPerspectiveDestination(menu, "/manager")).toEqual({ to: "/manager/fund/$fundId", params: { fundId: "fictional-fund" } });
    expect(clientPerspectiveDestination(menu, "/wealth")).toEqual({ to: "/view-as", search: { page: "/wealth" } });
  });
  it("shows the client's services, not the staff member's optional services", () => {
    const urls = clientPerspectiveLinks(menu).map((i) => i.url);
    expect(urls).toContain("/my-funds");
    expect(urls).not.toContain("/wealth");
    expect(urls).not.toContain("/manager/report-cards");
    expect(urls).not.toContain("/client/cap-table");
    const enabled = clientPerspectiveLinks({ ...menu, services: { wealth: true, reportCards: true }, hasCapTable: true, entitlements: ["fund_platform", "cap_table"] }).map((i) => i.url);
    expect(enabled).toContain("/wealth");
    expect(enabled).toContain("/manager/report-cards");
    expect(enabled).toContain("/client/cap-table");
  });
  it("honors client-specific hidden tabs even with purchased services", () => {
    const purchased = { ...menu, services: { wealth: true, reportCards: true } };
    expect(clientPerspectiveLinks(purchased).map((i) => i.url)).toContain("/manager/report-cards");
    expect(clientPerspectiveLinks({ ...purchased, hiddenTabs: ["report_cards"] }).map((i) => i.url)).not.toContain("/manager/report-cards");
  });
  it("uses the investor's navigation for investor perspective", () => {
    const urls = clientPerspectiveLinks({ ...menu, perspective: "investor" }).map((i) => i.url);
    expect(urls).toContain("/investor-reporting");
    expect(urls).not.toContain("/manager/investors");
  });
  it("restores ordinary menus outside a live exact-record preview", () => {
    expect(usesClientPerspectiveMenu("/manager/fund/fictional-fund", true, menu)).toBe(true);
    expect(usesClientPerspectiveMenu("/view-as", true, { ...menu, perspective: "investor" })).toBe(true);
    expect(usesClientPerspectiveMenu("/manager/fund/other", true, menu)).toBe(false);
    expect(usesClientPerspectiveMenu("/manager/fund/fictional-fund", false, menu)).toBe(false);
    expect(usesClientPerspectiveMenu("/manager/fund/fictional-fund", true, null)).toBe(false);
    expect(usesClientPerspectiveMenu("/ops", true, menu)).toBe(false);
  });
});