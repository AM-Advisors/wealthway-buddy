import { describe, expect, it } from "vitest";
import { tabEnabled, hiddenTabs, filterByHiddenTabs } from "./client-tab-access";

describe("client tab access", () => {
  it("Cap Table switched off is hidden from the menu", () => {
    const hidden = hiddenTabs({ cap_table: false }, null);
    expect(hidden).toContain("cap_table");
    expect(filterByHiddenTabs([{ url: "/client/cap-table" }, { url: "/client/funds" }], hidden)).toEqual([{ url: "/client/funds" }]);
  });
  it("Wealth switched off is hidden", () => {
    expect(tabEnabled("wealth", { wealth: false }, null)).toBe(false);
    expect(filterByHiddenTabs([{ url: "/wealth" }], hiddenTabs({ wealth: false }, null))).toEqual([]);
  });
  it("without purchase Cap Table is off on a purchased-services menu", () => {
    expect(tabEnabled("cap_table", {}, ["fund_platform"])).toBe(false);
  });
  it("staff override beats the purchase default", () => {
    expect(tabEnabled("cap_table", { cap_table: true }, ["fund_platform"])).toBe(true);
    expect(tabEnabled("funds", { funds: false }, ["fund_platform"])).toBe(false);
  });
});

describe("Report Cards menu", () => {
  it("shows only when the client has Report Cards, unless staff override it", async () => {
    const { tabEnabled, tabForPath } = await import("./client-tab-access");
    expect(tabForPath("/manager/report-cards")).toBe("report_cards");
    expect(tabForPath("/client/report-cards")).toBe("report_cards");
    expect(tabEnabled("report_cards", {}, ["fund_platform"])).toBe(false);
    expect(tabEnabled("report_cards", {}, ["report_cards"])).toBe(true);
    expect(tabEnabled("report_cards", { report_cards: false }, ["report_cards"])).toBe(false);
  });
});
