import { describe, expect, it } from "vitest";
import { markMethodFor, matchHolding, normalizeInvestorDocReading, shareableKindFor, sharingBlock } from "@/lib/investor-update-reader-model";

describe("investor document reader rules", () => {
  it("never lets a document about one investor be shared with the whole fund", () => {
    expect(sharingBlock({ kind: "valuation_report", aboutOneInvestor: true })).toMatch(/one investor/);
  });
  it("sends capital account statements, tax forms and financial statements to their own reviewed homes", () => {
    expect(sharingBlock({ kind: "capital_account_statement", aboutOneInvestor: false })).not.toBeNull();
    expect(sharingBlock({ kind: "tax_form", aboutOneInvestor: false })).not.toBeNull();
    expect(sharingBlock({ kind: "financial_statement", aboutOneInvestor: false })).not.toBeNull();
    expect(sharingBlock({ kind: "fund_agreement", aboutOneInvestor: false })).not.toBeNull();
  });
  it("allows a fund-wide valuation report", () => {
    expect(sharingBlock({ kind: "valuation_report", aboutOneInvestor: false })).toBeNull();
    expect(shareableKindFor("valuation_report")).toBe("valuation_report");
    expect(shareableKindFor("tax_form")).toBe("other");
  });
  it("reads holding values as cents and removes account numbers from text", () => {
    const r = normalizeInvestorDocReading({ kind: "valuation_report", title: "Q3 valuation", asOfDate: "09/30/2026", summary: "Account 123456789012 noted.", aboutOneInvestor: false,
      holdings: [{ companyName: "Acme Inc.", assetName: "Acme Series A", assetClass: "private_preferred", value: "$2,500,000", cost: "1M", valuationDate: "2026-09-30", method: "recent financing round", page: 2 }], notes: [] });
    expect(r.asOfDate).toBe("2026-09-30");
    expect(r.holdings[0]!.valueCents).toBe(250_000_000);
    expect(r.holdings[0]!.costCents).toBe(100_000_000);
    expect(r.summary).not.toMatch(/123456789012/);
    const short = normalizeInvestorDocReading({ kind: "valuation_report", holdings: [{ companyName: "Northwind Robotics", assetName: "Series A Preferred", assetClass: "private_preferred", value: "1", cost: null, valuationDate: null, method: null, page: null }] });
    expect(short.holdings[0]!.assetName).toBe("Northwind Robotics Series A Preferred");
  });
  it("matches a holding to one fund investment only when unambiguous", () => {
    const assets = [{ id: "a", asset_name: "Acme Series A", issuer_name: "Acme, Inc." }, { id: "b", asset_name: "Beta SAFE", issuer_name: "Beta" }, { id: "c", asset_name: "Beta Note", issuer_name: "Beta" }];
    expect(matchHolding({ assetName: "acme series a", companyName: "Acme" }, assets)?.id).toBe("a");
    expect(matchHolding({ assetName: "Beta Preferred", companyName: "Beta" }, assets)).toBeNull();
    expect(matchHolding({ assetName: "Gamma", companyName: "Gamma" }, assets)).toBeNull();
  });
  it("maps the document's method wording to a recorded method", () => {
    expect(markMethodFor("Recent financing round")).toBe("recent_financing");
    expect(markMethodFor("independent 409A appraisal")).toBe("third_party");
    expect(markMethodFor(null)).toBe("manager_mark");
  });
});
