import { describe, expect, it } from "vitest";
import { investorTierFor, productByKey } from "./product-pricing";
import { priceOrder } from "./saas-order-model";

describe("investor servicing tiers", () => {
  it.each([[25, "essentials"], [26, "standard"], [75, "standard"], [76, "plus"], [150, "plus"], [151, "premier"], [300, "premier"], [301, "institutional"]])("%i investors -> %s", (n, k) => {
    expect(investorTierFor(n).key).toBe(k);
  });
  it("quarterly is yearly / 4 + 10%", () => {
    const l = productByKey("venture").servicing.investor.find((x) => x.name.startsWith("Standard"))!;
    expect(l.prices.map((p) => p.amount)).toEqual([3500, 963]);
  });
  it("SaaS keeps markup on paid tiers", () => {
    const l = productByKey("saas").servicing.investor.find((x) => x.name.startsWith("Essentials"))!;
    expect(l.prices[0]!.amount).toBe(Math.round(1500 * 1.25 * 1.5));
  });
  it("order charges investor servicing per fund", () => {
    const o = priceOrder({ funds: 2, servicing: "self_serve", capTable: "none", alaCarte: {}, investorServicing: "essentials" }, "annual");
    expect(o.lines.find((l) => l.key === "investor_servicing_essentials")?.total).toBe(2 * Math.round(1500 * 1.25 * 1.5));
  });
});
