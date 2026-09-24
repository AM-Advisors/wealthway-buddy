/** Pure cap-table derivation: ownership comes only from posted security transactions. */

export type Tx = {
  id: string; company_id: string; kind: string; quantity: number; effective_date: string;
  stakeholder_id: string | null; counterparty_stakeholder_id: string | null;
  security_class: string; instrument: string; posting_status: "draft" | "review" | "posted";
  reverses_transaction_id?: string | null;
};
export type Stakeholder = { id: string; company_id: string; name: string };

const ADD = new Set(["issuance", "exercise", "conversion", "safe_conversion", "note_conversion", "grant"]);
const REMOVE = new Set(["cancellation", "repurchase", "forfeiture"]);
const TRANSFER = new Set(["transfer", "secondary_transfer"]);
const DILUTIVE_ONLY = new Set(["option", "warrant", "safe", "note", "rsu"]);

export type Position = { stakeholderId: string; securityClass: string; instrument: string; quantity: number };

export function positions(txs: Tx[], opts: { companyId: string; asOf?: string }): Position[] {
  const reversed = new Set(txs.filter((t) => t.posting_status === "posted" && t.reverses_transaction_id).map((t) => t.reverses_transaction_id!));
  const map = new Map<string, Position>();
  const bump = (sh: string | null, t: Tx, q: number) => {
    if (!sh) return;
    const k = `${sh}|${t.security_class}|${t.instrument}`;
    const p = map.get(k) ?? { stakeholderId: sh, securityClass: t.security_class, instrument: t.instrument, quantity: 0 };
    p.quantity += q; map.set(k, p);
  };
  for (const t of txs) {
    if (t.company_id !== opts.companyId || t.posting_status !== "posted") continue;
    if (t.reverses_transaction_id || reversed.has(t.id)) continue;
    if (opts.asOf && t.effective_date > opts.asOf) continue;
    if (ADD.has(t.kind)) bump(t.stakeholder_id, t, t.quantity);
    else if (REMOVE.has(t.kind)) bump(t.stakeholder_id, t, -t.quantity);
    else if (TRANSFER.has(t.kind)) { bump(t.counterparty_stakeholder_id, t, -t.quantity); bump(t.stakeholder_id, t, t.quantity); }
  }
  return [...map.values()].filter((p) => p.quantity !== 0);
}

export function summarize(txs: Tx[], opts: { companyId: string; asOf?: string; authorized?: number | null }) {
  const pos = positions(txs, opts);
  const outstanding = pos.filter((p) => !DILUTIVE_ONLY.has(p.instrument)).reduce((s, p) => s + p.quantity, 0);
  const fullyDiluted = pos.reduce((s, p) => s + p.quantity, 0);
  const group = (key: (p: Position) => string) => {
    const m = new Map<string, number>();
    for (const p of pos) m.set(key(p), (m.get(key(p)) ?? 0) + p.quantity);
    return [...m.entries()].map(([k, q]) => ({ key: k, quantity: q, pctFullyDiluted: fullyDiluted ? (q / fullyDiluted) * 100 : 0 }));
  };
  const scoped = txs.filter((t) => t.company_id === opts.companyId);
  return {
    authorized: opts.authorized ?? null,
    outstanding,
    fullyDiluted,
    byStakeholder: group((p) => p.stakeholderId),
    byClass: group((p) => p.securityClass),
    pending: scoped.filter((t) => t.posting_status !== "posted").length,
    latestEffectiveDate: scoped.filter((t) => t.posting_status === "posted").map((t) => t.effective_date).sort().at(-1) ?? null,
  };
}

/** Stakeholder records never create ownership on their own. */
export function holdingsFor(stakeholderId: string, txs: Tx[], companyId: string) {
  return positions(txs, { companyId }).filter((p) => p.stakeholderId === stakeholderId);
}

/** A posted transaction is never edited; corrections are new reversal entries. */
export function canEditTransaction(t: Pick<Tx, "posting_status">) {
  return t.posting_status !== "posted";
}

export type CompanyRelationship = { companyAdmin: boolean; staffCapTableEdit: boolean; managesFundHolding: boolean };
export function canEditCompany(r: CompanyRelationship) {
  return r.companyAdmin || r.staffCapTableEdit; // managing a fund that holds shares grants nothing
}

export const DOCUMENT_PURPOSES = {
  corporate: "Corporate", equity: "Equity", financing: "Financing", valuation_tax: "Valuation / Tax", reports: "Reports",
} as const;
export function documentPurpose(docType: string | null | undefined): keyof typeof DOCUMENT_PURPOSES {
  const t = (docType ?? "").toLowerCase();
  if (/(formation|charter|bylaw|operating|consent|board|certificate_of)/.test(t)) return "corporate";
  if (/(409a|valuation|tax|83b)/.test(t)) return "valuation_tax";
  if (/(round|side_letter|investor_agreement|term_sheet|financing)/.test(t)) return "financing";
  if (/(report|export|cap_table)/.test(t)) return "reports";
  return "equity";
}

export function toCsv(rows: Record<string, string | number | null>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
