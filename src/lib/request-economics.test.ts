import { describe, expect, it } from "vitest";
import { economicsFromRequest, parsePercent, termsWithFees } from "./request-economics";

describe("fund request fees → Setup Fees & terms", () => {
  it("Snoretox-style answers become a 10% fee and 20% carry draft", () => {
    const e = economicsFromRequest({ management_fee: "10%", carried_interest: "20%", preferred_return: "None", classes: [{ name: "Class A", fee: "", carry: "", hurdle: "", minimum: "" }] });
    expect(e.terms.managementFee?.ratePercent).toBe(10);
    expect(e.terms.carry?.ratePercent).toBe(20);
    expect(e.terms.notApplicable).toContain("preferredReturn");
    expect(e.classes).toEqual([]);
    expect(e.hasAny).toBe(true);
  });
  it("falls back to the first class when the fund-level answer is blank", () => {
    const e = economicsFromRequest({ management_fee: "", carried_interest: "", classes: [{ name: "Class A", fee: "1%", carry: "20%", hurdle: "Not applicable", minimum: "" }] });
    expect(e.fees).toMatchObject({ managementFeePct: 1, carryPct: 20, hurdlePct: 0 });
  });
  it("two named classes carry their own fee, carry and minimum", () => {
    const e = economicsFromRequest({ management_fee: "6%", carried_interest: "20%", classes: [
      { name: "Class A", fee: "6%", carry: "20%", hurdle: "", minimum: "" },
      { name: "Class B", fee: "0%", carry: "0%", hurdle: "", minimum: "$250,000" },
    ] });
    expect(e.classes).toHaveLength(2);
    expect(e.classes[1]).toMatchObject({ key: "class_b", managementFee: { ratePercent: 0 }, carry: { ratePercent: 0 }, minInvestmentCents: 25_000_000 });
  });
  it("blank answers never erase a recorded value", () => {
    const t = termsWithFees({ managementFee: { ratePercent: 2, basis: "committed_capital", frequency: "annual" }, carry: { ratePercent: 20 } }, { managementFeePct: null, carryPct: 15, hurdlePct: null });
    expect(t.managementFee).toEqual({ ratePercent: 2, basis: "committed_capital", frequency: "annual" });
    expect(t.carry?.ratePercent).toBe(15);
  });
  it("reads none/blank percentages safely", () => {
    expect(parsePercent("None")).toBe(0);
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("2.5%")).toBe(2.5);
  });
});
