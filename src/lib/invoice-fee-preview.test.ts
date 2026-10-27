import { describe, expect, it } from "vitest";
import { previewInvoiceFee, type FeePreviewFacts } from "./invoice-fee-preview";

const facts = (): FeePreviewFacts => ({
  clientId: "client", status: "issued", number: "FICTIONAL-001",
  line: { id: "line", label: "Administration", amount_cents: 1200000, offering_id: "fund" },
  target: { id: "fund", client_id: "client", kind: "fund", name: "Fictional Fund" },
  books: [{ id: "book", client_id: "client", offering_id: "fund", client_entity_id: null, basis: "accrual" }],
  periods: [{ book_id: "book", period_start: "2026-10-01", period_end: "2026-10-31", status: "open" }],
  mappings: [{ book_id: "book", purpose: "expense:administration", account_id: "expense" }, { book_id: "book", purpose: "accounts_payable", account_id: "payable" }],
  accounts: [{ id: "expense", book_id: "book", code: "5200", name: "Administration expense", account_type: "expense" }, { id: "payable", book_id: "book", code: "2000", name: "Accounts payable", account_type: "liability" }],
  journals: [],
});
const input = { entryDate: "2026-10-15", category: "administration" };
describe("read-only invoice fee proposals", () => {
  it("previews the exact $12,000 fee as expense and payable, never cash", () => {
    const result = previewInvoiceFee(facts(), input);
    expect(result.ready).toBe(true);
    expect(result.lines.map(l => [l.accountId, l.debitCents, l.creditCents])).toEqual([["expense", 1200000, 0], ["payable", 0, 1200000]]);
    expect(result.source).toEqual({ table: "invoice_lines", id: "line" });
  });
  it("does not infer cash movement from a paid invoice", () => {
    expect(previewInvoiceFee({ ...facts(), status: "paid" }, input).lines[1]?.accountId).toBe("payable");
  });
  it.each(["draft", "void"])("blocks %s invoice fees", status => expect(previewInvoiceFee({ ...facts(), status }, input).ready).toBe(false));
  it("never prepares proposed bookkeeping pricing", () => {
    const f = facts(); f.line.service_key = "BOOKKEEPING_ACCOUNTING";
    expect(previewInvoiceFee(f, input).ready).toBe(false);
  });
  it("blocks another client's company", () => {
    const f = facts(); f.target = { id: "company", client_id: "other", kind: "company", name: "Other" };
    expect(previewInvoiceFee(f, input).ready).toBe(false);
  });
  it("requires exact company books instead of a fund book", () => {
    const f = facts(); f.line.offering_id = null; f.target = { id: "company", client_id: "client", kind: "company", name: "Company" };
    expect(previewInvoiceFee(f, input).ready).toBe(false);
    f.books[0] = { id: "book", client_id: "client", offering_id: null, client_entity_id: "company", basis: "accrual" };
    expect(previewInvoiceFee(f, input).ready).toBe(true);
  });
  it("blocks missing or duplicate account mappings", () => {
    const f = facts(); f.mappings = [];
    expect(previewInvoiceFee(f, input).ready).toBe(false);
    f.mappings = [...facts().mappings, ...facts().mappings];
    expect(previewInvoiceFee(f, input).ready).toBe(false);
  });
  it.each(["closed", "locked", "review"])("refuses a %s period", status => {
    const f = facts(); if (f.periods[0]) f.periods[0].status = status;
    expect(previewInvoiceFee(f, input).ready).toBe(false);
  });
  it("refuses missing and overlapping periods", () => {
    expect(previewInvoiceFee({ ...facts(), periods: [] }, input).ready).toBe(false);
    expect(previewInvoiceFee({ ...facts(), periods: [...facts().periods, ...facts().periods] }, input).ready).toBe(false);
  });
  it.each(["draft", "reviewed", "approved", "posted", "reversed"])("blocks a second proposal for an existing %s source", status => {
    const f = facts(); f.journals = [{ id: "existing", status, source_id: "line" }];
    const result = previewInvoiceFee(f, input);
    expect(result.ready).toBe(false); expect(result.existingEntryId).toBe("existing"); expect(result.lines).toEqual([]);
  });
  it("does not count a voided source as active", () => {
    const f = facts(); f.journals = [{ id: "old", status: "voided", source_id: "line" }];
    expect(previewInvoiceFee(f, input).ready).toBe(true);
  });
  it("requires a real calendar date", () => expect(previewInvoiceFee(facts(), { ...input, entryDate: "2026-02-30" }).ready).toBe(false));
  it("requires an explicit category", () => expect(previewInvoiceFee(facts(), { ...input, category: "" }).ready).toBe(false));
  it("keeps cash books blocked without separate receipt evidence", () => {
    const f = facts(); if (f.books[0]) f.books[0].basis = "cash";
    expect(previewInvoiceFee(f, input).ready).toBe(false);
  });
  it("does not mutate source records or create persistent entries", () => {
    const f = facts(); const before = structuredClone(f);
    expect(previewInvoiceFee(f, input)).toEqual(previewInvoiceFee(f, input)); expect(f).toEqual(before);
  });
});