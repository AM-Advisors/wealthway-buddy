import { describe, expect, it } from "vitest";
import { ACCOUNTING_TERMS, PRODUCTS, allLines, productByKey } from "./product-pricing";

describe("product pricing", () => {
  it("has the six products", () => {
    expect(PRODUCTS.map((p) => p.key)).toEqual(["cap_table", "venture", "private_equity", "hedge", "spv", "saas"]);
  });
  it("every price is monthly, quarterly, yearly or one-time", () => {
    for (const p of PRODUCTS) for (const l of allLines(p)) {
      expect(l.prices.length).toBeGreaterThan(0);
      for (const pr of l.prices) expect(["monthly", "quarterly", "annual", "one_time"]).toContain(pr.billing);
    }
  });
  it("SPV fees are back at pre-increase prices", () => {
    expect(productByKey("spv").fundCost.map((l) => l.prices[0]!.amount)).toEqual([5000, 7500, 12500, 15000, null]);
  });
  it("servicing contains no accounting work", () => {
    for (const p of PRODUCTS) for (const l of [...p.servicing.client, ...p.servicing.investor]) {
      const text = [l.name, l.description ?? "", ...(l.items ?? [])].join(" ").toLowerCase();
      for (const t of ACCOUNTING_TERMS) expect(text).not.toContain(t);
    }
  });
  it("SaaS fund documents are $500 and Form D stays $160", () => {
    const a = productByKey("saas").alaCarte;
    expect(a.find((l) => l.name.startsWith("Harmonious fund documents"))!.prices[0]!.amount).toBe(500);
    expect(a.find((l) => l.name.startsWith("Form D"))!.prices[0]!.amount).toBe(160);
  });
});

describe("25% increase removed except SaaS", () => {
  it("standard fund prices are pre-increase", () => {
    const v = productByKey("venture");
    expect(v.fundCost[0]!.prices[0]!.amount).toBe(2500);
    expect(v.alaCarte.find((l) => l.name === "Capital call")!.prices[0]!.amount).toBe(2000);
  });
  it("SaaS keeps the increased prices", () => {
    const s = productByKey("saas");
    expect(s.fundCost[0]!.prices[0]!.amount).toBe(3125);
    expect(s.alaCarte.find((l) => l.name === "Capital call")!.prices[0]!.amount).toBe(3750);
  });
});
