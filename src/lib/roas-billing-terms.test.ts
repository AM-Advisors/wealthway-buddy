import { describe, expect, it } from "vitest";
import { quarterCharge, roasAnnualK1Charges, ROAS_BILLING_TERMS as terms } from "./roas-billing-terms";

describe("confirmed ROAS billing", () => {
  it("prices one annual 2026 K-1 set for each entity at $2,500 due December 31", () => {
    expect(roasAnnualK1Charges(2026)).toEqual([
      { entity: "LP entity", amountCents: 250000, dueOn: "2026-12-31" },
      { entity: "Management company", amountCents: 250000, dueOn: "2026-12-31" },
    ]);
  });
  it("repeats $5,000 of K-1 sets on December 31 each following year", () => {
    const charges = roasAnnualK1Charges(2027);
    expect(charges.reduce((sum, charge) => sum + charge.amountCents, 0)).toBe(500000);
    expect(charges.map(charge => charge.dueOn)).toEqual(["2027-12-31", "2027-12-31"]);
  });
  it("does not prepare annual K-1 charges before 2026", () => expect(() => roasAnnualK1Charges(2025)).toThrow());
  it("keeps setup at $7,500 including 100 investors", () => {
    expect(terms.setupCents).toBe(750000);
    expect(terms.includedInvestorCount).toBe(100);
  });
  it("keeps LP financials at $7,500 quarterly", () => expect(terms.lpFinancialsQuarterlyCents).toBe(750000));
  it("keeps management annual charge at $2,000", () => expect(terms.managementAnnualCents).toBe(200000));
  it("leaves $1,000 on the $2,500 LP charge", () => expect(terms.lpAnnualCents - terms.lpAnnualPaidCents).toBe(100000));
  it("starts management financials in Q4 with quarter-end payment", () => {
    expect(quarterCharge(terms.managementFinancialsStart, terms.managementFinancialsQuarterlyCents, "arrears")).toMatchObject({ amountCents: 750000, dueOn: "2026-12-31", periodStart: "2026-10-01" });
  });
  it("prorates White Glove from August 24 through September 30", () => {
    expect(quarterCharge(terms.whiteGloveStart, terms.whiteGloveQuarterlyCents, "advance")).toEqual({ periodStart: "2026-08-24", periodEnd: "2026-09-30", quarterDays: 92, serviceDays: 38, amountCents: 495652, dueOn: "2026-08-24" });
  });
  it("makes full-quarter White Glove $12,000 due October 1", () => expect(quarterCharge("2026-10-01", terms.whiteGloveQuarterlyCents, "advance")).toMatchObject({ amountCents: 1200000, dueOn: "2026-10-01" }));
});