import { describe, it, expect } from "vitest";
import { prefill1065, tieChecks, checkDetailStage } from "./form-1065-detail";
import { checkPf, managerIrsView } from "./form-pf";

const ret = { book_income_cents: 1000, adjustments_cents: 200, tax_income_cents: 1200 };
const k1s = [{ boxes: { "1": 700 } }, { boxes: { "1": 500 } }];

describe("1065 detail", () => {
  it("prefills Schedule K from K-1s and M-1 from the return", () => {
    const v = prefill1065(ret, k1s);
    expect(v["k_1"]).toBe(1200);
    expect(v["m1_9"]).toBe(1200);
  });
  it("flags Schedule K differences and blocks review", () => {
    const ties = tieChecks({ ...prefill1065(ret, k1s), k_1: 1100 }, k1s);
    expect(ties.find((t) => t.id === "k_vs_k1")?.ok).toBe(false);
    expect(checkDetailStage({ from: "draft", to: "ready_for_review", actorId: "a", preparedBy: null, ties })).toMatch(/tie-out/);
  });
  it("requires a different reviewer and locks reviewed detail", () => {
    const ties = tieChecks(prefill1065(ret, k1s), k1s);
    expect(checkDetailStage({ from: "ready_for_review", to: "reviewed", actorId: "a", preparedBy: "a", ties })).toMatch(/different/);
    expect(checkDetailStage({ from: "ready_for_review", to: "reviewed", actorId: "b", preparedBy: "a", ties })).toBeNull();
    expect(checkDetailStage({ from: "reviewed", to: "draft", actorId: "b", preparedBy: "a", ties })).toMatch(/locked/);
  });
});

describe("Form PF and IRS", () => {
  it("needs funds, a different reviewer, and filing evidence", () => {
    expect(checkPf("draft", "ready_for_review", "a", null, { offeringIds: [] })).toMatch(/Fund/);
    expect(checkPf("ready_for_review", "reviewed", "a", "a", { offeringIds: ["f"] })).toMatch(/different/);
    expect(checkPf("reviewed", "filed_by_adviser", "b", "a", { offeringIds: ["f"] })).toMatch(/confirmation/);
    expect(checkPf("filed_by_adviser", "draft", "b", "a", { offeringIds: ["f"] })).toMatch(/locked/);
  });
  it("managers only see shared IRS items without notes", () => {
    const v = managerIrsView([{ shareWithManager: false, notes: "x" }, { shareWithManager: true, notes: "y" }] as any);
    expect(v).toHaveLength(1);
    expect((v[0] as any).notes).toBeUndefined();
  });
});
