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
