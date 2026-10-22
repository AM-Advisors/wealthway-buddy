import { describe, it, expect } from "vitest";
import { bucketize, bucketKey, byService, resolveLayout, totals, type Fact } from "./client-dashboard-model";

const facts: Fact[] = [
  { kind: "cost_invoiced", fundId: "a", fundName: "Fund A", service: "Fund administration", date: "2026-01-15", cents: 300000 },
  { kind: "cost_paid", fundId: "a", fundName: "Fund A", service: "Fund administration", date: "2026-02-01", cents: 300000 },
  { kind: "fee_earned", fundId: "a", fundName: "Fund A", date: "2026-03-31", cents: 1000000 },
  { kind: "carry_earned", fundId: "b", fundName: "Fund B", date: "2026-05-02", cents: 500000 },
  { kind: "raised_funded", fundId: "b", fundName: "Fund B", date: "2026-05-02", cents: 9900000 },
];

describe("client dashboard periods", () => {
  it("quarters", () => expect(bucketKey("2026-05-02", "quarter").key).toBe("2026-Q2"));
  it("months", () => expect(bucketize(facts, "month").map((b) => b.key)).toEqual(["2026-01", "2026-02", "2026-03", "2026-05"]));
  it("per deal groups by fund", () => {
    const d = bucketize(facts, "deal");
    expect(d.find((b) => b.key === "Fund A")!.net).toBe(1000000 - 300000);
    expect(d.find((b) => b.key === "Fund B")!.earned).toBe(500000);
  });
  it("net is fees + carry minus Harmonious invoiced cost; raised capital is not earnings", () => {
    const t = totals(facts);
    expect(t.earned).toBe(1500000);
    expect(t.net).toBe(1200000);
    expect(t.funded).toBe(9900000);
  });
  it("costs by service", () => expect(byService(facts)).toEqual([{ service: "Fund administration", invoiced: 300000, paid: 300000 }]));
});

describe("dashboard layout", () => {
  it("drops unknown cards, appends missing, never hides attention", () => {
    const r = resolveLayout(["funds", "bogus", "funds"], ["attention", "sow"]);
    expect(r.order[0]).toBe("funds");
    expect(r.order).toContain("attention");
    expect(r.order).not.toContain("bogus");
    expect(r.hidden).toEqual(["sow"]);
  });
});
