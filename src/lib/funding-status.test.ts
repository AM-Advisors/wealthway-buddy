import { describe, expect, it } from "vitest";
import { effectiveFundingStatus as eff } from "./funding-status";
describe("effectiveFundingStatus", () => {
  it("treats settled on the application as funded", () => expect(eff("not_funded", "settled")).toBe("funded"));
  it("treats not started and not funded as the same nothing-yet state", () => expect(eff("not_funded", "not_started")).toBe("not_funded"));
  it("keeps the investment record when it has progress", () => expect(eff("investor_reports_sent", "not_started")).toBe("investor_reports_sent"));
});
