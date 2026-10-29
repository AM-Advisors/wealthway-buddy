import { describe, expect, it } from "vitest";
import { MANAGER_RESPONSIBILITIES, managerNextAction, managesExactFund } from "./fund-manager-responsibility";

describe("fund manager responsibility", () => {
  it("covers all ten responsibility areas without granting authority", () => {
    expect(MANAGER_RESPONSIBILITIES.map(x => x.key)).toEqual(["disclosures", "terms", "signers", "documents", "reports", "capital", "bank", "verification", "formation", "templates"]);
  });
  it("allows an assigned manager for their exact fund", () => {
    expect(managesExactFund({ isStaff: false, offeringIds: ["fund-a"] }, "fund-a")).toBe(true);
  });
  it("denies unrelated funds and removed assignments", () => {
    expect(managesExactFund({ isStaff: false, offeringIds: ["fund-a"] }, "fund-b")).toBe(false);
    expect(managesExactFund({ isStaff: false, offeringIds: [] }, "fund-a")).toBe(false);
  });
  it("keeps staff visibility", () => {
    expect(managesExactFund({ isStaff: true, offeringIds: [] }, "fund-a")).toBe(true);
  });
  it("prioritizes recorded overdue work without changing it", () => {
    const items = [{ id: "first", title: "Terms", area: "setup" }, { id: "late", title: "Review report", area: "accounting", due: "2026-10-28" }];
    expect(managerNextAction(items, "2026-10-29")?.id).toBe("late");
    expect(items[0]?.id).toBe("first");
  });
  it("does not invent an action when there are no pending items", () => {
    expect(managerNextAction([], "2026-10-29")).toBeNull();
  });
});