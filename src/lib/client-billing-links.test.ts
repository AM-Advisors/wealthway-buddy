import { describe, expect, it } from "vitest";
import { billingDate, invoiceDueState, invoiceSourceMatches, invoiceSowMatches } from "./client-billing-links";
const invoice = { client_id: "client", sales_quote_id: "quote", acceptance_key: "quote:quote:2", sow_id: "sow" };
const quote = { id: "quote", client_id: "client", version: 2, status: "signed" };
describe("invoice document relationships", () => {
  it("links only the exact invoice quote and accepted version", () => {
    expect(invoiceSourceMatches(invoice, quote)).toBe(true);
    expect(invoiceSourceMatches(invoice, { ...quote, version: 3 })).toBe(false);
    expect(invoiceSourceMatches(invoice, { ...quote, id: "other" })).toBe(false);
  });
  it("never exposes another client's quote", () => expect(invoiceSourceMatches(invoice, { ...quote, client_id: "other" })).toBe(false));
  it("never exposes draft quotes", () => expect(invoiceSourceMatches(invoice, { ...quote, status: "draft" })).toBe(false));
  it("SOW links require exact recorded same-client published agreement", () => {
    expect(invoiceSowMatches(invoice, { id: "sow", client_id: "client", status: "active" })).toBe(true);
    expect(invoiceSowMatches(invoice, { id: "sow", client_id: "other", status: "active" })).toBe(false);
    expect(invoiceSowMatches(invoice, { id: "sow", client_id: "client", status: "draft" })).toBe(false);
  });
});
describe("recorded payment due dates", () => {
  const due = { due_date: "2026-10-26", status: "issued", total_cents: 1900000, recorded_paid_cents: 1150000 };
  it("shows due today for an unpaid balance on the recorded due date", () => expect(invoiceDueState(due, "2026-10-26")).toBe("due_today"));
  it("shows overdue only after the due date", () => expect(invoiceDueState(due, "2026-10-27")).toBe("overdue"));
  it("does not treat a paid or void invoice as overdue", () => {
    expect(invoiceDueState({ ...due, status: "paid" }, "2026-10-27")).toBe("settled");
    expect(invoiceDueState({ ...due, status: "void" }, "2026-10-27")).toBe("settled");
  });
  it("missing dates are not invented from issue or agreement dates", () => expect(invoiceDueState({ ...due, due_date: null }, "2026-10-27")).toBe("not_set"));
  it("formats date-only values without local timezone shifts", () => expect(billingDate("2026-10-26")).toBe("Oct 26, 2026"));
});