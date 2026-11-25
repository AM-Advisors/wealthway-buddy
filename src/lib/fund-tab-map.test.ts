import { describe, expect, it } from "vitest";
import { FUND_TOP_TABS, normalizeFundTab, topTabFor } from "./fund-tab-map";

describe("fund tab map", () => {
  it("has ten top tabs with Requests inside Activity", () => expect(FUND_TOP_TABS.map((t) => t.value)).toEqual(["overview", "setup", "investors", "documents", "approvals", "banking", "closes", "regulatory", "accounting", "activity"]));
  it.each([["details", "setup"], ["team", "setup"], ["todos", "overview"], ["requests", "requests"], ["calendar", "calendar"], ["regulatory", "regulatory"], ["services", "services"], ["audit", "audit"], ["capital", "distributions"], ["payments", "accounting"]])("old tab %s opens %s", (old, next) => expect(normalizeFundTab(old)).toBe(next));
  it("old Requests and Activity links open the combined tab", () => { expect(topTabFor("requests").value).toBe("activity"); expect(normalizeFundTab("activity")).toBe("open"); });
  it("calendar lives under Activity", () => expect(topTabFor("calendar").value).toBe("activity"));
  it("Close and Compliance are their own tabs", () => { expect(topTabFor("closes").value).toBe("closes"); expect(topTabFor("regulatory").value).toBe("regulatory"); });
  it("unknown tabs fall back to Overview", () => expect(normalizeFundTab("nope")).toBe("overview"));
  it("bank statements and transactions live under Banking", () => {
    expect(topTabFor("statements").value).toBe("banking");
    expect(topTabFor("transactions").value).toBe("banking");
    expect(FUND_TOP_TABS.find((t) => t.value === "banking")?.group).toEqual(["banking", "statements", "transactions"]);
    expect(FUND_TOP_TABS.find((t) => t.value === "accounting")?.group).not.toContain("statements");
    expect(normalizeFundTab("bank_statements")).toBe("statements");
    expect(normalizeFundTab("bank_transactions")).toBe("transactions");
  });
});
