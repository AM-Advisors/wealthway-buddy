import { describe, expect, it } from "vitest";
import { FUND_TOP_TABS, normalizeFundTab, topTabFor } from "./fund-tab-map";

describe("fund tab map", () => {
  it("has eight top tabs and no hidden More menu", () => expect(FUND_TOP_TABS.map((t) => t.value)).toEqual(["overview", "setup", "investors", "documents", "approvals", "banking", "accounting", "activity"]));
  it.each([["details", "setup"], ["team", "setup"], ["todos", "overview"], ["requests", "requests"], ["calendar", "calendar"], ["regulatory", "regulatory"], ["services", "services"], ["audit", "audit"], ["capital", "distributions"]])("old tab %s opens %s", (old, next) => expect(normalizeFundTab(old)).toBe(next));
  it("requests live under Approvals", () => expect(topTabFor("requests").value).toBe("approvals"));
  it("calendar lives under Activity", () => expect(topTabFor("calendar").value).toBe("activity"));
  it("unknown tabs fall back to Overview", () => expect(normalizeFundTab("nope")).toBe("overview"));
});
