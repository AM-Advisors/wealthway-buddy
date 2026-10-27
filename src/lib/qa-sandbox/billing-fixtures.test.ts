import { describe, expect, it } from "vitest";
import { fictionalBillingReadback, QA_INVOICE, QA_QUOTE, QA_SOW } from "./billing-fixtures";
import { invoiceSourceMatches, invoiceSowMatches } from "../client-billing-links";
import { invoicePeriodTotals } from "../invoice-period-totals";

describe("fictional connected billing readback", () => {
  it("reads the recorded partial payment without collecting money", () => {
    expect(fictionalBillingReadback()).toEqual({ balance: { paidCents: 450000, remainingCents: 750000, partiallyPaid: true }, quoteLinked: true, sowLinked: true });
  });
  it("rejects another client's original quote or agreement", () => {
    expect(invoiceSourceMatches(QA_INVOICE, { ...QA_QUOTE, client_id: "other" })).toBe(false);
    expect(invoiceSowMatches(QA_INVOICE, { ...QA_SOW, client_id: "other" })).toBe(false);
  });
  it("keeps quote version linkage exact", () => expect(invoiceSourceMatches(QA_INVOICE, { ...QA_QUOTE, version: 2 })).toBe(false));
  it.each(["monthly", "quarterly", "annual"] as const)("reads %s periods without changing payment history", cadence => {
    const before = structuredClone(QA_INVOICE);
    expect(invoicePeriodTotals([QA_INVOICE], [QA_INVOICE.id], cadence).map(p => [p.billedCents, p.paidCents, p.remainingCents])).toEqual([[1200000, 450000, 750000]]);
    expect(QA_INVOICE).toEqual(before);
  });
});