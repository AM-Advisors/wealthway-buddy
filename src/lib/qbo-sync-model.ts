/**
 * QuickBooks exchange rules. Pure: parsing, mapping, de-duplication, export
 * and drift. QuickBooks never writes our ledger directly — inbound items only
 * become draft entries that still need second-person approval.
 */

/** Marker we stamp on every entry we export, so a re-import is recognised as ours. */
export const HMS_MARKER = "[HMS:";
export const hmsTag = (entryId: string) => `${HMS_MARKER}${entryId.slice(0, 8)}]`;

export type QboLine = { account: string; debitCents: number; creditCents: number; memo?: string | undefined };
export type QboTxn = { id: string; date: string | null; memo: string; lines: QboLine[] };

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function toCents(raw: string | undefined | null): number {
  if (!raw) return 0;
  const s = raw.replace(/[$,\s]/g, "");
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function col(header: string[], names: string[]) {
  const h = header.map(norm);
  for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; }
  return -1;
}

/** Parse a QuickBooks journal export (Journal No / Date / Account / Debits / Credits / Memo). */
export function parseQboJournalCsv(text: string): { txns: QboTxn[]; error?: string } {
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => col(r, ["Account", "Account Name", "AccountName"]) >= 0 && col(r, ["Debit", "Debits"]) >= 0);
  if (hi < 0) return { txns: [], error: "The file needs Account, Debit and Credit columns." };
  const h = rows[hi]!;
  const iNo = col(h, ["Journal No", "JournalNo", "Num", "No", "Transaction ID", "Id"]);
  const iDate = col(h, ["Journal Date", "JournalDate", "Date", "Txn Date"]);
  const iAcct = col(h, ["Account", "Account Name", "AccountName"]);
  const iDr = col(h, ["Debit", "Debits"]);
  const iCr = col(h, ["Credit", "Credits"]);
  const iMemo = col(h, ["Memo", "Description", "Memo/Description"]);
  if (iNo < 0) return { txns: [], error: "The file needs a Journal No (or Num) column to group lines." };
  const map = new Map<string, QboTxn>();
  let last = "";
  for (const r of rows.slice(hi + 1)) {
    const id = (r[iNo] ?? "").trim() || last;
    const account = (r[iAcct] ?? "").trim();
    if (!id || !account || /^total/i.test(account)) continue;
    last = id;
    const t = map.get(id) ?? { id, date: null, memo: "", lines: [] };
    const d = iDate >= 0 ? (r[iDate] ?? "").trim() : "";
    if (d && !t.date) t.date = isoDate(d);
    const memo = iMemo >= 0 ? (r[iMemo] ?? "").trim() : "";
    if (memo && !t.memo) t.memo = memo;
    t.lines.push({ account, debitCents: Math.abs(toCents(r[iDr])), creditCents: Math.abs(toCents(r[iCr])), memo: memo || undefined });
    map.set(id, t);
  }
  return { txns: [...map.values()] };
}

export function isoDate(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

export type InboundOutcome = "drafted" | "skipped_duplicate" | "skipped_ours" | "needs_mapping" | "unbalanced";

/** Decide what happens to one QuickBooks transaction. "drafted" means: create a draft entry. */
export function classifyInbound(
  txn: QboTxn,
  mappings: ReadonlyMap<string, string>,
  alreadyDrafted: ReadonlySet<string>,
): { outcome: InboundOutcome; detail?: string; missing?: string[] } {
  if (alreadyDrafted.has(txn.id)) return { outcome: "skipped_duplicate", detail: "Already brought in." };
  if ([txn.memo, ...txn.lines.map((l) => l.memo ?? "")].some((m) => m.includes(HMS_MARKER))) {
    return { outcome: "skipped_ours", detail: "This entry came from our ledger." };
  }
  const dr = txn.lines.reduce((t, l) => t + l.debitCents, 0);
  const cr = txn.lines.reduce((t, l) => t + l.creditCents, 0);
  if (dr !== cr || dr === 0) return { outcome: "unbalanced", detail: `Debits ${dr} and credits ${cr} don't match.` };
  const missing = [...new Set(txn.lines.map((l) => l.account).filter((a) => !mappings.has(mapKey(a))))];
  if (missing.length) return { outcome: "needs_mapping", detail: `Map: ${missing.join(", ")}`, missing };
  return { outcome: "drafted" };
}

export const mapKey = (qboAccountName: string) => qboAccountName.trim().toLowerCase();

/** Latest mapping per QuickBooks account wins (mappings are versioned by created_at). */
export function currentMappings(rows: readonly { qbo_account_name: string; account_id: string; created_at: string }[]) {
  const m = new Map<string, string>();
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) m.set(mapKey(r.qbo_account_name), r.account_id);
  return m;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export type ExportEntry = {
  id: string;
  entryNo: number | string;
  date: string;
  memo: string | null;
  lines: { accountName: string; debitCents: number; creditCents: number; memo?: string | null }[];
};

/** QuickBooks Online journal-entry import format. Every row carries our marker. */
export function toQboJournalCsv(entries: readonly ExportEntry[]): string {
  const out = [["JournalNo", "JournalDate", "AccountName", "Debits", "Credits", "Description"].join(",")];
  for (const e of entries) {
    const tag = hmsTag(e.id);
    for (const l of e.lines) {
      out.push([
        `HMS-${e.entryNo}`,
        e.date,
        l.accountName,
        l.debitCents ? (l.debitCents / 100).toFixed(2) : "",
        l.creditCents ? (l.creditCents / 100).toFixed(2) : "",
        `${(l.memo ?? e.memo ?? "").trim()} ${tag}`.trim(),
      ].map(csvCell).join(","));
    }
  }
  return out.join("\n") + "\n";
}

/** Parse a QuickBooks trial balance export (Account / Debit / Credit). Balance = debit − credit. */
export function parseQboTrialBalanceCsv(text: string): { rows: { account: string; balanceCents: number }[]; error?: string } {
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => col(r, ["Debit", "Debits"]) >= 0 && col(r, ["Credit", "Credits"]) >= 0);
  if (hi < 0) return { rows: [], error: "The file needs Debit and Credit columns." };
  const h = rows[hi]!;
  const iDr = col(h, ["Debit", "Debits"]);
  const iCr = col(h, ["Credit", "Credits"]);
  const iAcct = Math.max(0, col(h, ["Account", "Account Name", ""]));
  const out: { account: string; balanceCents: number }[] = [];
  for (const r of rows.slice(hi + 1)) {
    const account = (r[iAcct] ?? "").trim();
    if (!account || /^total/i.test(account)) continue;
    out.push({ account, balanceCents: Math.abs(toCents(r[iDr])) - Math.abs(toCents(r[iCr])) });
  }
  return { rows: out };
}

export type DriftRow = { account: string; ledgerCents: number; qboCents: number; diffCents: number; mapped: boolean };

/**
 * Compare QuickBooks balances (debit-positive) to our ledger balances
 * (debit-positive, keyed by our account id) through the mappings.
 */
export function computeDrift(
  qbo: readonly { account: string; balanceCents: number }[],
  ledgerByAccountId: ReadonlyMap<string, number>,
  mappings: ReadonlyMap<string, string>,
): { rows: DriftRow[]; maxDiffCents: number } {
  const rows: DriftRow[] = qbo.map((q) => {
    const id = mappings.get(mapKey(q.account));
    const ledgerCents = id ? ledgerByAccountId.get(id) ?? 0 : 0;
    return { account: q.account, ledgerCents, qboCents: q.balanceCents, diffCents: q.balanceCents - ledgerCents, mapped: Boolean(id) };
  });
  return { rows, maxDiffCents: rows.reduce((m, r) => Math.max(m, Math.abs(r.diffCents)), 0) };
}

export function outboundDecisionAllowed(batchCreatedBy: string, deciderId: string) {
  return batchCreatedBy !== deciderId;
}
