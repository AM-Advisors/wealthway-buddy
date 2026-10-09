/**
 * Fund accounting prerequisites - pure model (no I/O).
 * Investment purchases, fund expenses/payables and configurable account
 * mappings. Accounts are never hard-coded: every journal line is resolved
 * from the book's active mappings, and a missing mapping blocks preparation.
 * There is no generic "Other" expense category.
 */

export const EXPENSE_CATEGORIES = [
  { key: "legal", label: "Legal" },
  { key: "accounting", label: "Accounting" },
  { key: "audit_tax", label: "Audit & tax" },
  { key: "professional", label: "Professional services" },
  { key: "administration", label: "Fund administration" },
  { key: "bank_fee", label: "Bank fees" },
  { key: "organizational", label: "Organizational" },
  { key: "operating", label: "Fund operating" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];
export const isExpenseCategory = (c: string): c is ExpenseCategory => EXPENSE_CATEGORIES.some((e) => e.key === c);

export const CORE_PURPOSES = ["cash", "investment_cost", "accounts_payable", "accrued_expenses"] as const;
export type MappingPurpose = (typeof CORE_PURPOSES)[number] | `expense:${ExpenseCategory}`;
export const ALL_PURPOSES: MappingPurpose[] = [...CORE_PURPOSES, ...EXPENSE_CATEGORIES.map((c) => `expense:${c.key}` as const)];
export const PURPOSE_ACCOUNT_TYPE: Record<string, "asset" | "liability" | "expense"> = {
  cash: "asset", investment_cost: "asset", accounts_payable: "liability", accrued_expenses: "liability",
  ...Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [`expense:${c.key}`, "expense"])),
};

export type Mapping = { purpose: string; accountId: string };
export type Line = { purpose: MappingPurpose; debitCents?: number; creditCents?: number };

export function resolveLines(lines: Line[], mappings: Mapping[]): { ok: true; lines: { accountId: string; debitCents?: number; creditCents?: number }[] } | { ok: false; missing: string[] } {
  const map = new Map(mappings.map((m) => [m.purpose, m.accountId]));
  const missing = [...new Set(lines.map((l) => l.purpose).filter((p) => !map.has(p)))];
  if (missing.length) return { ok: false, missing };
  return { ok: true, lines: lines.map((l) => ({ accountId: map.get(l.purpose)!, ...(l.debitCents ? { debitCents: l.debitCents } : {}), ...(l.creditCents ? { creditCents: l.creditCents } : {}) })) };
}
export const missingMappingMessage = (missing: string[]) => `ACCOUNT MAPPING MISSING - posting blocked: ${missing.join(", ")}`;

// ------------------------------------------------------------ investments
export type PurchaseInput = {
  kind: "purchase" | "additional_purchase";
  assetId: string | null;
  newIssuerName: string | null;
  newAssetName: string | null;
  tradeDate: string;
  settlementDate: string | null;
  principalCents: number;
  transactionCostCents: number;
  sourceReference: string;
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Existing vs new holding is explicit: a follow-on must name the existing holding, a purchase must not. */
export function purchaseError(i: PurchaseInput): string | null {
  if (!ISO.test(i.tradeDate)) return "Trade date is required.";
  if (i.settlementDate && (!ISO.test(i.settlementDate) || i.settlementDate < i.tradeDate)) return "Settlement date cannot be before the trade date.";
  if (!Number.isInteger(i.principalCents) || i.principalCents <= 0) return "Purchase price must be a positive amount.";
  if (!Number.isInteger(i.transactionCostCents) || i.transactionCostCents < 0) return "Transaction costs cannot be negative.";
  if (!i.sourceReference.trim()) return "A source reference is required.";
  if (i.kind === "additional_purchase" && !i.assetId) return "An additional purchase must select the existing holding.";
  if (i.kind === "purchase" && i.assetId) return "This security is already held - record an additional purchase instead.";
  if (i.kind === "purchase" && (!i.newIssuerName?.trim() || !i.newAssetName?.trim())) return "A new purchase needs the issuer and security.";
  return null;
}

/** Dr investments at cost (principal + capitalised transaction costs) / Cr cash. */
export function purchaseLines(principalCents: number, transactionCostCents: number): Line[] {
  const total = principalCents + transactionCostCents;
  return [{ purpose: "investment_cost", debitCents: total }, { purpose: "cash", creditCents: total }];
}
export const purchaseCashOutflow = (principalCents: number, transactionCostCents: number) => -(principalCents + transactionCostCents);

// --------------------------------------------------------------- expenses
export type ExpenseInputModel = {
  category: string;
  vendor: string;
  invoiceNumber: string | null;
  expenseDate: string;
  amountCents: number;
  paymentMode: "paid" | "accrued";
  paidOn: string | null;
  sourceReference: string;
};
export function expenseError(e: ExpenseInputModel): string | null {
  if (!isExpenseCategory(e.category)) return `REVIEW REQUIRED - "${e.category}" is not an approved expense category.`;
  if (!e.vendor.trim()) return "Vendor is required.";
  if (!ISO.test(e.expenseDate)) return "Expense date is required.";
  if (!Number.isInteger(e.amountCents) || e.amountCents <= 0) return "Amount must be positive.";
  if (e.paymentMode === "paid" && (!e.paidOn || !ISO.test(e.paidOn))) return "A paid expense needs the payment date.";
  if (e.paymentMode === "accrued" && e.paidOn) return "An accrued expense has not been paid - leave the payment date empty.";
  if (!e.sourceReference.trim()) return "A source reference is required.";
  return null;
}
/** Same vendor + invoice (or same vendor/date/amount when no invoice) is the same expense. */
export function expenseFingerprint(e: Pick<ExpenseInputModel, "vendor" | "invoiceNumber" | "expenseDate" | "amountCents">) {
  const v = e.vendor.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return e.invoiceNumber?.trim() ? `inv|${v}|${e.invoiceNumber.trim().toLowerCase()}` : `nodoc|${v}|${e.expenseDate}|${e.amountCents}`;
}
/** Paid: Dr expense / Cr cash. Accrued: Dr expense / Cr accrued expenses (cash untouched). */
export function expenseLines(category: ExpenseCategory, amountCents: number, mode: "paid" | "accrued"): Line[] {
  return [{ purpose: `expense:${category}`, debitCents: amountCents }, { purpose: mode === "paid" ? "cash" : "accrued_expenses", creditCents: amountCents }];
}
/** Settling a payable never touches an expense account: Dr liability / Cr cash. */
export function settlementLines(liability: "accounts_payable" | "accrued_expenses", amountCents: number): Line[] {
  return [{ purpose: liability, debitCents: amountCents }, { purpose: "cash", creditCents: amountCents }];
}
export function settlementError(i: { amountCents: number; outstandingCents: number }): string | null {
  if (!Number.isInteger(i.amountCents) || i.amountCents <= 0) return "Settlement must be positive.";
  if (i.amountCents > i.outstandingCents) return "Settlement exceeds the outstanding payable.";
  return null;
}

// ------------------------------------------------------------ segregation
export type RecordStatus = "prepared" | "approved" | "rejected" | "posted" | "reversed";
export function decisionError(r: { status: RecordStatus; preparedBy: string }, actor: string): string | null {
  if (r.status !== "prepared") return `Only a prepared record can be decided (this one is ${r.status}).`;
  if (r.preparedBy === actor) return "The preparer cannot review or approve their own record.";
  return null;
}
export function postError(r: { status: RecordStatus; decidedBy: string | null }, actor: string): string | null {
  if (r.status === "posted") return "Already posted.";
  if (r.status !== "approved") return "Only an approved record can be posted.";
  if (r.decidedBy === actor) return "The approver cannot also post.";
  return null;
}

// --------------------------------------------------------------- fee terms
export function feeTermDecisionError(t: { approvalStatus: string; preparedBy: string | null; createdBy: string | null; sourceDocument: string | null }, actor: string, approve: boolean): string | null {
  if (t.approvalStatus !== "pending") return `Only a pending fee term can be decided (this one is ${t.approvalStatus}).`;
  if ((t.preparedBy ?? t.createdBy) === actor) return "The preparer cannot approve their own fee term.";
  if (approve && !t.sourceDocument?.trim()) return "A fee term needs its contractual source before approval.";
  return null;
}

// ------------------------------------------------------- bank cash links
/** Statement lines store a positive amount plus a direction; cash movements are signed. */
export const signedBankCents = (l: { amount_cents: number | string; direction?: string | null }) =>
  l.direction === "out" ? -Math.abs(Number(l.amount_cents)) : Number(l.amount_cents);
/** Bank transactions: direction is authoritative (feeds store magnitudes); without it, positive = inflow. */
export const signedBankTxCents = (t: { amount_cents: number | string; direction?: string | null }) => {
  const a = Math.abs(Number(t.amount_cents));
  if (["out", "outbound", "outflow", "debit"].includes(String(t.direction ?? ""))) return -a;
  if (["in", "inbound", "inflow", "credit"].includes(String(t.direction ?? ""))) return a;
  return Number(t.amount_cents);
};
/** One bank movement may evidence exactly one accounting record, at exactly its cash amount. */
export function bankLinkError(i: { cashCents: number; bankSignedCents: number; alreadyLinkedTo: string | null }): string | null {
  if (i.alreadyLinkedTo) return `That bank activity is already linked to ${i.alreadyLinkedTo}.`;
  if (i.bankSignedCents !== i.cashCents) return `BANK AMOUNT MISMATCH - review required: bank ${i.bankSignedCents} vs record ${i.cashCents} cents.`;
  return null;
}
/** A bank reconciliation for activity already accounted for reuses that record's journal - never a second cash entry. */
export function reconciliationJournalDecision(linked: { status: string; journalEntryId: string | null } | null):
  { action: "draft" } | { action: "reuse"; entryId: string } | { action: "wait"; reason: string } {
  if (!linked) return { action: "draft" };
  if (linked.status === "posted" && linked.journalEntryId) return { action: "reuse", entryId: linked.journalEntryId };
  if (linked.status === "reversed") return { action: "wait", reason: "The linked accounting record was reversed - resolve the bank exception before reconciling." };
  return { action: "wait", reason: "This bank activity belongs to an accounting record that is not posted yet - post it first; no second cash entry is created." };
}
/** New chart accounts: expense type, unique code/name, numbered inside the parent's range. */
export function newAccountError(i: { code: string; name: string; accountType: string; parentCode: string | null }, existing: { code: string; name: string }[]): string | null {
  if (!/^\d{4}$/.test(i.code)) return "Account code must be four digits.";
  if (i.accountType !== "expense") return "Only expense accounts can be added here.";
  if (!i.code.startsWith("5")) return "Expense accounts use the 5000 range.";
  if (i.parentCode && i.code.slice(0, 2) !== i.parentCode.slice(0, 2)) return "The code must sit inside the parent account's range.";
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (existing.some((a) => a.code === i.code)) return "DUPLICATE - that account code already exists.";
  if (existing.some((a) => norm(a.name) === norm(i.name))) return "DUPLICATE - an account with that name already exists.";
  return null;
}
