/**
 * Trial balance from posted journal lines. Pure: no I/O.
 * Balances are signed by each account's normal balance (debit-normal accounts
 * show debits minus credits; credit-normal accounts show credits minus debits).
 */
export type TbAccount = { id: string; code: string; name: string; account_type: string; normal_balance: string };
export type TbLine = { account_id: string; debit_cents: number; credit_cents: number };
export type TbRow = TbAccount & { debitCents: number; creditCents: number; balanceCents: number };

export function trialBalance(accounts: readonly TbAccount[], lines: readonly TbLine[]) {
  const sums = new Map<string, { d: number; c: number }>();
  for (const l of lines) {
    const s = sums.get(l.account_id) ?? { d: 0, c: 0 };
    s.d += Number(l.debit_cents) || 0;
    s.c += Number(l.credit_cents) || 0;
    sums.set(l.account_id, s);
  }
  const rows: TbRow[] = [...accounts]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => {
      const s = sums.get(a.id) ?? { d: 0, c: 0 };
      const balanceCents = a.normal_balance === "credit" ? s.c - s.d : s.d - s.c;
      return { ...a, debitCents: s.d, creditCents: s.c, balanceCents };
    })
    .filter((r) => r.debitCents !== 0 || r.creditCents !== 0);
  const totalDebitCents = rows.reduce((t, r) => t + r.debitCents, 0);
  const totalCreditCents = rows.reduce((t, r) => t + r.creditCents, 0);
  return { rows, totalDebitCents, totalCreditCents, ties: totalDebitCents === totalCreditCents };
}

/** Cash per the ledger: the signed balance of every cash-subtype account. */
export function ledgerCashCents(rows: readonly (TbRow & { subtype?: string | null })[]) {
  return rows.filter((r) => r.subtype === "cash").reduce((t, r) => t + r.balanceCents, 0);
}

export const JOURNAL_SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  bank_reconciliation: "Bank reconciliation",
  payment: "Payment",
  capital_call: "Capital call",
  distribution: "Distribution",
  fee_accrual: "Fee accrual",
  expense: "Expense",
  valuation: "Valuation",
  allocation: "Allocation",
  adjustment: "Adjustment",
  reversal: "Reversal",
  migration: "Migration",
  quickbooks: "QuickBooks",
};
