import type { FeePreviewFacts } from "../invoice-fee-preview";
import { QA_INVOICE } from "./billing-fixtures";
import { QA_FUND_ID, QA_FUND_NAME } from "./fictional-data";

export const QA_FEE_ID = "00000000-0000-4000-8000-000000000101";
export function fictionalFeeFacts(): FeePreviewFacts {
  return {
    clientId: QA_INVOICE.client_id, number: QA_INVOICE.number, status: QA_INVOICE.status,
    line: { id: QA_FEE_ID, label: "Quarterly administration", amount_cents: QA_INVOICE.total_cents, offering_id: QA_FUND_ID },
    target: { id: QA_FUND_ID, client_id: QA_INVOICE.client_id, kind: "fund", name: QA_FUND_NAME },
    books: [{ id: "qa-book", client_id: QA_INVOICE.client_id, offering_id: QA_FUND_ID, client_entity_id: null, basis: "accrual" }],
    periods: [{ book_id: "qa-book", period_start: "2026-10-01", period_end: "2026-12-31", status: "open" }],
    mappings: [{ book_id: "qa-book", purpose: "expense:administration", account_id: "qa-expense" }, { book_id: "qa-book", purpose: "accounts_payable", account_id: "qa-payable" }],
    accounts: [{ id: "qa-expense", book_id: "qa-book", code: "5200", name: "Administration expense", account_type: "expense" }, { id: "qa-payable", book_id: "qa-book", code: "2000", name: "Accounts payable", account_type: "liability" }],
    journals: [],
  };
}