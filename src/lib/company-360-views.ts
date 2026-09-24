/** Adapts the loaded company workspace to the pure ownership engine. No stored totals are used. */
import { positions, summarize, type Tx } from "./company-360-model";

export type WsTx = {
  id: string; kind: string; quantity: number; amount: number | null; effectiveDate: string;
  stakeholderId: string | null; counterpartyId: string | null; securityId: string | null;
  postingStatus: "draft" | "review" | "posted"; reversesTransactionId: string | null;
};
export type WsSecurity = { id: string; className: string | null; securityType: string };
export type WsStakeholder = { id: string; name: string; type: string; email: string | null };

export function toModelTxs(companyId: string, txs: WsTx[], securities: WsSecurity[]): Tx[] {
  const sec = new Map(securities.map((s) => [s.id, s]));
  return txs.map((t) => {
    const s = t.securityId ? sec.get(t.securityId) : undefined;
    return {
      id: t.id, company_id: companyId, kind: t.kind, quantity: t.quantity, effective_date: t.effectiveDate,
      stakeholder_id: t.stakeholderId, counterparty_stakeholder_id: t.counterpartyId,
      security_class: s?.className ?? s?.securityType ?? "Unclassified",
      instrument: s?.securityType ?? "common", posting_status: t.postingStatus,
      reverses_transaction_id: t.reversesTransactionId,
    };
  });
}

export function ownershipView(
  companyId: string, txs: Tx[], stakeholders: WsStakeholder[], opts: { asOf?: string; authorized?: number | null } = {},
) {
  const s = summarize(txs, { companyId, ...opts });
  const pos = positions(txs, { companyId, ...(opts.asOf ? { asOf: opts.asOf } : {}) });
  const names = new Map(stakeholders.map((x) => [x.id, x.name]));
  const dilutive = new Set(["option", "warrant", "safe", "note", "rsu"]);
  const rows = stakeholders.map((sh) => {
    const mine = pos.filter((p) => p.stakeholderId === sh.id);
    const out = mine.filter((p) => !dilutive.has(p.instrument)).reduce((a, p) => a + p.quantity, 0);
    const fd = mine.reduce((a, p) => a + p.quantity, 0);
    return {
      id: sh.id, name: sh.name, type: sh.type, securities: mine.length, outstanding: out, fullyDiluted: fd,
      pctOutstanding: s.outstanding ? (out / s.outstanding) * 100 : 0,
      pctFullyDiluted: s.fullyDiluted ? (fd / s.fullyDiluted) * 100 : 0,
    };
  });
  return { summary: s, positions: pos, rows, nameOf: (id: string) => names.get(id) ?? "Unknown" };
}

/** Transactions involving one stakeholder only. */
export function stakeholderTransactions<T extends { stakeholderId: string | null; counterpartyId: string | null }>(id: string, txs: T[]) {
  return txs.filter((t) => t.stakeholderId === id || t.counterpartyId === id);
}

export function reportHeader(company: string, type: string, asOf: string | null, cutoff: string | null, now = new Date()) {
  return { company, reportType: type, generatedAt: now.toISOString(), asOf: asOf ?? "current", dataCutoff: cutoff ?? "none posted" };
}
