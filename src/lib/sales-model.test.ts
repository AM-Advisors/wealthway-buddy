import { describe, expect, it } from "vitest";
import { canMoveToStage, normalizeStage, periodRange, priceQuote, quoteApprovalProblem, salesScope } from "./sales-model";

describe("sales model", () => {
  it("scopes by role", () => {
    expect(salesScope(["cro"])).toBe("all");
    expect(salesScope(["sales_management"])).toBe("team");
    expect(salesScope(["bdr"])).toBe("own");
    expect(salesScope(["investor"])).toBe("none");
  });
  it("limits BDRs to early stages", () => {
    expect(canMoveToStage(["bdr"], "meeting_set")).toBe(true);
    expect(canMoveToStage(["bdr"], "quoted")).toBe(false);
    expect(canMoveToStage(["bdr"], "contract_lost")).toBe(false);
    expect(canMoveToStage(["account_executive"], "contract_won")).toBe(true);
  });
  it("prices quotes and flags discounts", () => {
    const q = priceQuote([{ serviceKey: "a", label: "A", quantity: 2, unitCents: 100, baselineUnitCents: 150 }]);
    expect(q.totalCents).toBe(200);
    expect(q.baselineCents).toBe(300);
    expect(q.needsExecApproval).toBe(true);
  });
  it("enforces quote approvers", () => {
    expect(quoteApprovalProblem({ actorId: "a", actorRoles: ["cro"], createdBy: "a", needsExec: false })).toMatch(/drafted/);
    expect(quoteApprovalProblem({ actorId: "b", actorRoles: ["sales_management"], createdBy: "a", needsExec: true })).toMatch(/CEO/);
    expect(quoteApprovalProblem({ actorId: "b", actorRoles: ["sales_management"], createdBy: "a", needsExec: false })).toBeNull();
  });
  it("normalizes legacy stages and periods", () => {
    expect(normalizeStage("won")).toBe("contract_won");
    const r = periodRange("month", new Date("2026-10-03T12:00:00Z"));
    expect(r.from).toBe("2026-10-01T00:00:00.000Z");
    expect(r.to).toBe("2026-11-01T00:00:00.000Z");
  });
});
