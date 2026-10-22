import { describe, expect, it } from "vitest";
import { ACCOUNTING_TERMS, PRODUCTS, allLines, productByKey } from "./product-pricing";

describe("product pricing", () => {
  it("has the six products", () => {
    expect(PRODUCTS.map((p) => p.key)).toEqual(["cap_table", "venture", "private_equity", "hedge", "spv", "saas"]);
  });
  it("no monthly option: every price is quarterly, yearly or one-time", () => {
    for (const p of PRODUCTS) for (const l of allLines(p)) {
      expect(l.prices.length).toBeGreaterThan(0);
      for (const pr of l.prices) expect(["quarterly", "annual", "one_time"]).toContain(pr.billing);
    }
  });
  it("SPV fees are back at pre-increase prices", () => {
    expect(productByKey("spv").fundCost.map((l) => l.prices[0]!.amount)).toEqual([5000, 7500, 12500, 15000, null]);
  });
  it("SPVs offer priced Core, Plus, White Glove and Institutional servicing", () => {
    const c = productByKey("spv").servicing.client;
    expect(c.map((l) => l.name)).toEqual(["Self Serve", "Core", "Plus", "White Glove", "Institutional"]);
    expect(c[1]!.prices[0]!.amount).toBe(1500);
    expect(c[2]!.prices[0]!.amount).toBe(2500);
    expect(c[3]!.prices[0]!.amount).toBe(7500);
  });
  it("servicing contains no accounting work", () => {
    for (const p of PRODUCTS) for (const l of [...p.servicing.client, ...p.servicing.investor]) {
      const text = [l.name, l.description ?? "", ...(l.items ?? [])].join(" ").toLowerCase();
      for (const t of ACCOUNTING_TERMS) expect(text).not.toContain(t);
    }
  });
  it("SaaS has no services included and bills yearly or quarterly", () => {
    const s = productByKey("saas");
    // Nothing included: no client servicing line is free ($0) or marked "Included".
    for (const l of s.servicing.client) for (const pr of l.prices) expect(pr.amount === 0 || pr.note === "Included").toBe(false);
    expect(s.servicing.client.some((l) => (l.description ?? "").toLowerCase().includes("no services included"))).toBe(true);
    // The platform fee carries both a yearly and a quarterly price.
    const fee = s.fundCost[0]!.prices;
    expect(fee.map((p) => p.billing)).toEqual(["annual", "quarterly"]);
    expect(fee[0]!.amount).toBe(fee[1]!.amount);
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

describe("aligned to the rate card", () => {
  const sum = (p: ReturnType<typeof productByKey>, i: number, b: "annual" | "quarterly") =>
    p.administration[0]!.prices.find((x) => x.billing === b)!.amount! + p.servicing.client[i]!.prices.find((x) => x.billing === b)!.amount!;
  it("venture admin + servicing equals rate card yearly and quarterly", () => {
    const v = productByKey("venture");
    expect([sum(v, 1, "annual"), sum(v, 2, "annual"), sum(v, 3, "annual")]).toEqual([15000, 20000, 36000]);
    expect([sum(v, 1, "quarterly"), sum(v, 2, "quarterly"), sum(v, 3, "quarterly")]).toEqual([4250, 5500, 10000]);
  });
  it("cap table yearly: Starter 1200, Growth 3000, Scale custom", () => {
    expect(productByKey("cap_table").fundCost.map((l) => l.prices[0]!.amount)).toEqual([0, 1200, 3000, null, null]);
  });
});
