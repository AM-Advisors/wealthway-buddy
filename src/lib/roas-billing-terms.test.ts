import { describe, expect, it } from "vitest";
import { quarterCharge, ROAS_BILLING_TERMS as terms } from "./roas-billing-terms";

describe("confirmed ROAS billing", () => {
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