import { describe, expect, it } from "vitest";
import { k1PaymentStatus, paymentTotals, trackedK1Sets, type TrackedInvoice } from "./roas-payment-tracking";

const invoice: TrackedInvoice = { id: "fictional-1", number: "FABLE-1", status: "issued", totalCents: 500000, paidCents: 250000, remainingCents: 250000, paidOn: "2026-10-27", dueDate: "2026-12-31", periodStart: "2026-01-01", periodEnd: "2026-12-31" };
describe("ROAS payment evidence", () => {
  it("does not mark either $2,500 K-1 set paid from a partial $2,500 invoice receipt", () => {
    expect(k1PaymentStatus(invoice)).toEqual({ status: "Allocation needed", paidOn: null });
  });
  it("shows the recorded settlement date for a fully paid invoice", () => {
    expect(k1PaymentStatus({ ...invoice, status: "paid", paidCents: 500000, remainingCents: 0 })).toEqual({ status: "Paid", paidOn: "2026-10-27" });
  });
  it("excludes voided and draft invoices from current received and balance totals", () => {
    expect(paymentTotals([invoice, { ...invoice, id: "void", status: "void" }, { ...invoice, id: "draft", status: "draft" }])).toEqual({ billedCents: 500000, receivedCents: 250000, balanceCents: 250000 });
  });
  it("keeps voided K-1 history unpaid", () => expect(k1PaymentStatus({ ...invoice, status: "void" }).status).toBe("Voided"));
  it("tracks two annual $2,500 sets due December 31", () => {
    expect(trackedK1Sets([], [], 2026).expected).toEqual([{ entity: "LP entity", amountCents: 250000, dueOn: "2026-12-31" }, { entity: "Management company", amountCents: 250000, dueOn: "2026-12-31" }]);
  });
  it("does not infer a tax year from the payment deadline", () => {
    const { sets } = trackedK1Sets([{ ...invoice, periodStart: null, periodEnd: null }], [{ id: "line", invoiceId: invoice.id, label: "K-1 set", serviceKey: "tax_k1", amountCents: 250000 }], 2026);
    expect(sets[0]?.taxYear).toBeNull();
  });
  it("does not mix a prior service year into selected K-1 sets", () => {
    expect(trackedK1Sets([invoice], [{ id: "line", invoiceId: invoice.id, label: "K-1 set", serviceKey: "tax_k1", amountCents: 250000 }], 2027).sets).toEqual([]);
  });
});