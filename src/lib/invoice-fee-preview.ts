import { feeEligible, feeSource, feeTargetError, type FeeLine, type FeeTarget } from "./invoice-fee-accounting";
import { isExpenseCategory, type ExpenseCategory } from "./fund-accounting-model";

export type FeePreviewFacts = {
  clientId: string;
  status: string;
  number: string;
  line: FeeLine & { label: string };
  target: FeeTarget | null;
  books: { id: string; client_id: string | null; offering_id: string | null; client_entity_id: string | null; basis: string }[];
  periods: { book_id: string; period_start: string; period_end: string; status: string }[];
  mappings: { book_id: string; purpose: string; account_id: string }[];
  accounts: { id: string; book_id: string; code: string; name: string; account_type: string }[];
  journals: { id: string; status: string; source_id: string | null }[];
};

export type FeePreviewInput = { entryDate: string; category: string };
export type FeeEntryPreview = {
  ready: boolean;
  blockers: string[];
  source: { table: string; id: string };
  bookId: string | null;
  entryDate: string;
  memo: string;
  existingEntryId: string | null;
  lines: { accountId: string; code: string; name: string; debitCents: number; creditCents: number }[];
};

/** Read-only accrual proposal. Receipt evidence is never inferred from an issued or paid invoice. */
export function previewInvoiceFee(facts: FeePreviewFacts, input: FeePreviewInput): FeeEntryPreview {
  const blockers: string[] = [];
  const result: FeeEntryPreview = {
    ready: false, blockers, source: feeSource(facts.line.id), bookId: null,
    entryDate: input.entryDate, memo: `${facts.number} · ${facts.line.label}`,
    existingEntryId: null, lines: [],
  };
  if (!feeEligible(facts.status, facts.line)) blockers.push("Only issued or paid fees outside proposed bookkeeping pricing are eligible.");
  if (!facts.target) blockers.push("Assign this fee to a fund or company first.");
  else {
    const problem = feeTargetError(facts.clientId, facts.line, facts.target);
    if (problem) blockers.push(problem);
  }
  const existing = facts.journals.find(j => j.source_id === facts.line.id && j.status !== "voided");
  if (existing) {
    result.existingEntryId = existing.id;
    blockers.push("This invoice fee already has an accounting entry. Use its existing review or correction workflow.");
  }
  const parsedDate = new Date(`${input.entryDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.entryDate) blockers.push("Choose a valid accounting date.");
  if (!isExpenseCategory(input.category)) blockers.push("Choose an expense category explicitly.");
  const target = facts.target;
  const books = facts.books.filter(book => target && book.client_id === facts.clientId &&
    (target.kind === "fund" ? book.offering_id === target.id && !book.client_entity_id : book.client_entity_id === target.id && !book.offering_id));
  if (books.length !== 1) blockers.push(books.length ? "Multiple accounting books match this fee. Resolve the book ownership first." : "No active accounting book is linked to this exact fund or company.");
  const book = books.length === 1 ? books[0] : undefined;
  if (!book) return result;
  result.bookId = book.id;
  if (book.basis !== "accrual") blockers.push("Cash or tax books require separately reviewed payment evidence. This preview is accrual only.");
  const periods = facts.periods.filter(p => p.book_id === book.id && p.period_start <= input.entryDate && p.period_end >= input.entryDate);
  if (periods.length !== 1) blockers.push("The accounting date must belong to one recorded open period.");
  else if (periods[0]?.status !== "open") blockers.push("This accounting period is not open.");
  const purpose = `expense:${input.category as ExpenseCategory}`;
  const resolve = (key: string, type: string) => {
    const mappings = facts.mappings.filter(m => m.book_id === book.id && m.purpose === key);
    const account = mappings.length === 1 ? facts.accounts.find(a => a.id === mappings[0]?.account_id && a.book_id === book.id && a.account_type === type) : undefined;
    if (!account) blockers.push(`A unique ${key} account mapping is required in this book.`);
    return account;
  };
  const debit = resolve(purpose, "expense");
  const credit = resolve("accounts_payable", "liability");
  if (debit && credit && !blockers.length) {
    result.lines = [
      { accountId: debit.id, code: debit.code, name: debit.name, debitCents: facts.line.amount_cents, creditCents: 0 },
      { accountId: credit.id, code: credit.code, name: credit.name, debitCents: 0, creditCents: facts.line.amount_cents },
    ];
    result.ready = true;
  }
  return result;
}