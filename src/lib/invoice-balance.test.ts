import { describe, expect, it } from "vitest";
import { invoiceBalance } from "./invoice-balance";

describe("recorded invoice balances", () => {
  it("keeps ROAS's $19,000 invoice total and shows $11,500 received and $7,500 remaining", () => {
    expect(invoiceBalance({ total_cents: 1900000, status: "issued", recorded_paid_cents: 1150000 })).toEqual({ paidCents: 1150000, remainingCents: 750000, partiallyPaid: true });
  });
  it("does not infer a receipt from a payment declaration or note", () => {
    expect(invoiceBalance({ total_cents: 1900000, status: "issued" }).paidCents).toBe(0);
  });
  it("keeps the fully paid $7,500 setup invoice settled", () => {
    expect(invoiceBalance({ total_cents: 750000, status: "paid" }).remainingCents).toBe(0);
  });
  it("never shows a negative balance for overpayments or void invoices", () => {
    expect(invoiceBalance({ total_cents: 750000, status: "issued", recorded_paid_cents: 800000 }).remainingCents).toBe(0);
    expect(invoiceBalance({ total_cents: 750000, status: "void" }).remainingCents).toBe(0);
  });
});