import { describe, expect, it } from "vitest";
import { quarterCharge, roasAnnualK1Charges, roasChargesForYear, roasVisibleYears, roasChargeSummary, ROAS_ENTITIES, ROAS_BILLING_TERMS as terms } from "./roas-billing-terms";

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
  it("leaves $1,500 on the $2,500 management charge with $1,000 paid", () => {
    expect(terms.managementAnnualCents).toBe(250000);
    expect(terms.managementAnnualPaidCents).toBe(100000);
    expect(terms.managementAnnualCents - terms.managementAnnualPaidCents).toBe(150000);
  });
  it("fully settles the $2,500 LP 2026 annual fee", () => expect(terms.lpAnnualCents - terms.lpAnnualPaidCents).toBe(0));
  it("starts management financials in Q4 with quarter-end payment", () => {
    expect(terms.managementFinancialsAnnualCents).toBe(750000);
    expect(roasChargesForYear(2026).find(c => c.service === "Management company financials")).toMatchObject({ cadence: "Annual", dueOn: "2026-12-31", amountCents: 750000 });
  });
  it("prorates White Glove from August 24 through September 30", () => {
    expect(quarterCharge(terms.whiteGloveStart, terms.whiteGloveQuarterlyCents, "advance")).toEqual({ periodStart: "2026-08-24", periodEnd: "2026-09-30", quarterDays: 92, serviceDays: 38, amountCents: 495652, dueOn: "2026-08-24" });
  });
  it("makes full-quarter White Glove $12,000 due October 1", () => expect(quarterCharge("2026-10-01", terms.whiteGloveQuarterlyCents, "advance")).toMatchObject({ amountCents: 1200000, dueOn: "2026-10-01" }));
  it("shows $12,000 White Glove Q4 due now for the LP", () => expect(roasChargesForYear(2026).find(c => c.service === "White Glove Services")).toMatchObject({ entity: "lp", amountCents: 1200000, dueOn: "2026-10-01", reportedPaidCents: 0 }));
  it("adds the explicit $6,956.52 initial White Glove charge starting August 24 due now", () => {
    const charge = roasChargesForYear(2026).find(c => c.service === "White Glove Services, prorated");
    expect(charge).toMatchObject({ entity: "lp", amountCents: 695652, dueOn: "2026-08-24", period: "Aug 24 to Sep 30, 2026", reportedPaidCents: 0 });
    expect(roasChargeSummary(charge ? [charge] : [], "2026-10-28").dueNowCents).toBe(695652);
  });
  it("never repeats the initial proration in future years", () => {
    expect(roasChargesForYear(2027).filter(c => c.service === "White Glove Services, prorated")).toEqual([]);
    expect(roasChargesForYear(2028).filter(c => c.service === "White Glove Services, prorated")).toEqual([]);
  });
  it("keeps Q3 LP financials paid and Q4 due December 31", () => expect(roasChargesForYear(2026).filter(c => c.service === "Hedge fund financials").map(c => [c.dueOn, c.reportedPaidCents])).toEqual([["2026-09-30", 750000], ["2026-12-31", 0]]));
  it("bills $7,500 LP financials on every 2027 quarter end", () => expect(roasChargesForYear(2027).filter(c => c.service === "Hedge fund financials").map(c => [c.dueOn, c.amountCents])).toEqual([["2027-03-31", 750000], ["2027-06-30", 750000], ["2027-09-30", 750000], ["2027-12-31", 750000]]));
  it("renews both $2,500 entity fees August 31, 2027", () => expect(roasChargesForYear(2027).filter(c => c.service === "Annual entity fee").map(c => [c.dueOn, c.amountCents, c.reportedPaidCents])).toEqual([["2027-08-31", 250000, 0], ["2027-08-31", 250000, 0]]));
  it("links LP and management charges to distinct recorded entities", () => {
    expect(ROAS_ENTITIES.lp.id).toBe("a2c62dbe-1f52-4dfb-91e1-8345be7eab8e");
    expect(ROAS_ENTITIES.management.id).toBe("299b3c67-ec95-4e0a-8b49-621d9462f4ee");
    expect(ROAS_ENTITIES.management.offeringId).toBeNull();
  });
  it("shows 2026 and 2027 now but 2028 only starting January 1, 2028", () => {
    expect(roasVisibleYears("2026-10-28")).toEqual([2026, 2027]);
    expect(roasVisibleYears("2027-12-31")).toEqual([2026, 2027]);
    expect(roasVisibleYears("2028-01-01")).toEqual([2026, 2027, 2028]);
  });
  it("separates $11,000 reported paid, $20,456.52 due now and $20,000 future in 2026", () => expect(roasChargeSummary(roasChargesForYear(2026), "2026-10-28")).toEqual({ totalCents: 5145652, reportedPaidCents: 1100000, dueNowCents: 2045652, futureCents: 2000000 }));
  it("shows all $95,500 of 2027 as future with no invented payments", () => expect(roasChargeSummary(roasChargesForYear(2027), "2026-10-28")).toEqual({ totalCents: 9550000, reportedPaidCents: 0, dueNowCents: 0, futureCents: 9550000 }));
});