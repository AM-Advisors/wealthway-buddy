import { describe, expect, it } from "vitest";
import { fundEditKeys, pendingFundChanges } from "./fund-change-model";
describe("Fund pending request projection", () => {
  it("includes pending carry and side-letter requests without generic approvals", () => {
    const rows = pendingFundChanges({ fees: [{ id: "f", status: "pending_approval", carry_pct: 20, created_at: "2026-10-22" }], letters: [{ id: "s", status: "pending", after_snapshot: { secret: "private investor terms" }, created_at: "2026-10-21" }], edits: [], requests: [] });
    expect(rows.map(r => r.id)).toEqual(["fee:f", "letter:s"]);
    expect(rows.every(r => r.tab === "approvals")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("private investor terms");
  });
  it("does not present decided requests as pending", () => {
    expect(pendingFundChanges({ fees: [{ status: "active" }], letters: [{ status: "approved" }], edits: [{ status: "rejected" }], requests: [{ status: "COMPLETED" }, { status: "CANCELLED" }, { status: "DRAFT" }] })).toEqual([]);
  });
  it("scopes saved-edit lookup to the exact fund", () => {
    expect(fundEditKeys("fund-a")).toEqual(["fund_fields:fund-a", "legal_name:fund-a", "economics:fund-a", "ein:fund-a", "administration:fund-a"]);
    expect(fundEditKeys("fund-a")).not.toContain("economics:fund-b");
  });
});