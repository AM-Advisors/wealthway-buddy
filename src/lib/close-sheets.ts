/**
 * Close sheets. Pure: builds investor-closing summaries and month-end
 * checklists, and enforces second-person sign-off. An approved version is
 * locked; any change starts a new version.
 */
export type CloseSheetKind = "investor_closing" | "month_end";

export type ClosingInvestor = {
  applicationId: string;
  investor: string;
  committedCents: number;
  calledCents: number;
  receivedCents: number;
  signature: string;
  funding: string;
};

export function investorClosingTotals(rows: readonly ClosingInvestor[]) {
  return {
    investors: rows.length,
    committedCents: rows.reduce((t, r) => t + r.committedCents, 0),
    calledCents: rows.reduce((t, r) => t + r.calledCents, 0),
    receivedCents: rows.reduce((t, r) => t + r.receivedCents, 0),
    unsigned: rows.filter((r) => r.signature !== "Signed").length,
    unreceived: rows.filter((r) => r.receivedCents < r.calledCents).length,
  };
}

export type MonthEndFacts = {
  hasBook: boolean;
  unreconciledBankItems: number;
  openBankAlerts: number;
  unpostedEntries: number;
  trialBalanceTies: boolean;
  latestDriftMaxCents: number | null;
  driftExplained: boolean;
  qboLinked: boolean;
  /** Pilot M8: reviewed bank statement balance ending on the period end, vs ledger cash. */
  periodEndBalance?: { present: boolean; reviewed: boolean; diffCents: number | null; asOf: string | null } | null;
  /** Pilot M7: null = not applicable this period. */
  navPublished?: boolean | null;
  allocationsFinalized?: boolean | null;
  openAccountingExceptions?: number;
};

export type ChecklistItem = { key: string; label: string; ok: boolean; detail: string };

export function monthEndChecklist(f: MonthEndFacts): { items: ChecklistItem[]; ready: boolean } {
  const items: ChecklistItem[] = [
    { key: "book", label: "Ledger book open", ok: f.hasBook, detail: f.hasBook ? "Ready" : "Open the Fund's ledger first." },
    { key: "bank", label: "Bank reconciled", ok: f.unreconciledBankItems === 0, detail: f.unreconciledBankItems ? `${f.unreconciledBankItems} bank item(s) still to match` : "All bank items matched" },
    { key: "alerts", label: "No open bank alerts", ok: f.openBankAlerts === 0, detail: f.openBankAlerts ? `${f.openBankAlerts} open alert(s)` : "None open" },
    { key: "entries", label: "Entries approved and recorded", ok: f.unpostedEntries === 0, detail: f.unpostedEntries ? `${f.unpostedEntries} entry(ies) not yet recorded` : "All recorded" },
    { key: "tb", label: "Trial balance ties", ok: f.trialBalanceTies, detail: f.trialBalanceTies ? "Debits equal credits" : "Debits and credits differ" },
  ];
  if (f.periodEndBalance !== undefined) {
    const b = f.periodEndBalance;
    const ok = Boolean(b?.present && b.reviewed && b.diffCents === 0);
    items.push({
      key: "bank_balance",
      label: "Period-end bank balance reviewed and ties to ledger cash",
      ok,
      detail: !b?.present
        ? "Record the bank statement balance as of the period end date"
        : !b.reviewed
          ? "A second person must review the period-end statement balance"
          : b.diffCents === 0
            ? `Ties as of ${b.asOf}`
            : `Differs from ledger cash by ${((b.diffCents ?? 0) / 100).toFixed(2)}`,
    });
  }
  if (f.navPublished != null) items.push({ key: "nav", label: "NAV published for the period", ok: f.navPublished, detail: f.navPublished ? "Published" : "A NAV for this period is not yet published" });
  if (f.allocationsFinalized != null) items.push({ key: "allocations", label: "Investor allocations finalized", ok: f.allocationsFinalized, detail: f.allocationsFinalized ? "Finalized" : "An allocation run for this period is not finalized" });
  if (f.openAccountingExceptions !== undefined) items.push({ key: "exceptions", label: "Accounting exceptions resolved or waived", ok: f.openAccountingExceptions === 0, detail: f.openAccountingExceptions ? `${f.openAccountingExceptions} open exception(s)` : "None open" });
  if (f.qboLinked) {
    const clear = f.latestDriftMaxCents === 0 || f.driftExplained;
    items.push({
      key: "qbo",
      label: "QuickBooks drift cleared or explained",
      ok: f.latestDriftMaxCents !== null && clear,
      detail: f.latestDriftMaxCents === null ? "Run a drift check" : clear ? "Cleared" : "Differences need an explanation",
    });
  }
  return { items, ready: items.every((i) => i.ok) };
}

export function canDecideCloseSheet(preparedBy: string, deciderId: string, decision: "approved" | "returned", reason?: string | null): string | null {
  if (preparedBy === deciderId) return "A close sheet must be signed off by someone other than its preparer.";
  if (decision === "returned" && !reason?.trim()) return "Say why the sheet is being returned.";
  return null;
}

export function monthKey(d: string) {
  if (!/^\d{4}-\d{2}$/.test(d)) throw new Error("Choose a month (YYYY-MM).");
  return d;
}

export function monthBounds(key: string) {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const start = `${key}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}
