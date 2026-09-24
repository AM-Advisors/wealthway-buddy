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
      id: t.id, company_id: companyId, kind: t.kind,
      // legacy writes stored removals as negative numbers; the engine applies the sign itself
      quantity: ["cancellation", "repurchase", "forfeiture"].includes(t.kind) ? Math.abs(t.quantity) : t.quantity, effective_date: t.effectiveDate,
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

/* ---------------------------------------------------------------- reversal */
type OrigTx = { id: string; company_id: string; security_id: string | null; stakeholder_id: string | null;
  counterparty_stakeholder_id?: string | null; kind: string; quantity: number; amount: number | null;
  posting_status: string; reverses_transaction_id: string | null };
export function planReversal(
  orig: OrigTx | null,
  req: { companyId: string; effectiveDate: string; reason: string; correctionType: string },
): { ok: true; row: Record<string, any> & { quantity: number } } | { ok: false; error: string } {
  if (!orig || orig.company_id !== req.companyId) return { ok: false, error: "Transaction not found." };
  if (orig.posting_status !== "posted") return { ok: false, error: "Only finalized transactions are reversed. Edit the draft instead." };
  if (orig.reverses_transaction_id) return { ok: false, error: "A reversal cannot itself be reversed; record a new transaction." };
  if (req.correctionType !== "full_reversal") return { ok: false, error: "Reverse the full transaction, then record the corrected transaction." };
  return { ok: true, row: {
    company_id: orig.company_id, security_id: orig.security_id, stakeholder_id: orig.stakeholder_id,
    counterparty_stakeholder_id: orig.counterparty_stakeholder_id ?? null, kind: "reversal",
    quantity: Math.abs(Number(orig.quantity)), amount: orig.amount, effective_date: req.effectiveDate,
    reason: req.reason, reverses_transaction_id: orig.id, posting_status: "posted", posted_at: new Date().toISOString(),
  } };
}

/* ---------------------------------------------------------------- documents */
export type WsDoc = { id: string; title: string; docType: string; purpose: string | null; status: string;
  stakeholderId: string | null; securityId: string | null; transactionId: string | null; roundId: string | null;
  uploadedBy: string | null; createdAt: string; updatedAt: string };
export const DOC_GROUPS = ["Corporate", "Equity", "Financing", "Valuation & Tax", "Reports", "Other"] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];
export function docGroup(d: Pick<WsDoc, "purpose" | "docType">): DocGroup {
  const p = (d.purpose ?? "").toLowerCase();
  const map: Record<string, DocGroup> = { corporate: "Corporate", equity: "Equity", financing: "Financing", valuation_tax: "Valuation & Tax", reports: "Reports", other: "Other" };
  if (map[p]) return map[p];
  const t = d.docType.toLowerCase();
  if (/(formation|charter|bylaw|operating|consent|board|certificate_of)/.test(t)) return "Corporate";
  if (/(409a|valuation|tax|83b)/.test(t)) return "Valuation & Tax";
  if (/(safe|note|purchase|financing|term_sheet|side_letter)/.test(t)) return "Financing";
  if (/(grant|option|stock|certificate|transfer|exercise|equity)/.test(t)) return "Equity";
  if (/report/.test(t)) return "Reports";
  return "Other";
}
/** One canonical entry per document id, even when several relationships point at it. */
export function groupDocuments(docs: WsDoc[]) {
  const seen = new Map<string, WsDoc>();
  for (const d of docs) if (!seen.has(d.id)) seen.set(d.id, d);
  const out = Object.fromEntries(DOC_GROUPS.map((g) => [g, [] as WsDoc[]])) as Record<DocGroup, WsDoc[]>;
  for (const d of seen.values()) out[docGroup(d)].push(d);
  return out;
}
export function stakeholderDocuments(id: string, docs: WsDoc[], txs: { id: string; stakeholderId: string | null; counterpartyId: string | null; securityId: string | null }[]) {
  const mine = stakeholderTransactions(id, txs);
  const txIds = new Set(mine.map((t) => t.id));
  const secIds = new Set(mine.map((t) => t.securityId).filter(Boolean) as string[]);
  const byId = new Map<string, WsDoc>();
  for (const d of docs)
    if (d.stakeholderId === id || (d.transactionId && txIds.has(d.transactionId)) || (d.securityId && secIds.has(d.securityId))) byId.set(d.id, d);
  return [...byId.values()];
}

/* ---------------------------------------------------------------- activity */
export type WsEvent = { id: string; action: string; entityType: string | null; entityId: string | null; reason: string | null; occurredAt: string };
/** Events about this stakeholder, their transactions, securities or documents — never unrelated company activity. */
export function stakeholderActivity(id: string, events: WsEvent[], txIds: string[], docIds: string[], secIds: string[]) {
  const ids = new Set([id, ...txIds, ...docIds, ...secIds]);
  return events.filter((e) => e.entityId && ids.has(e.entityId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
export function activityLabel(action: string) {
  const k = action.replace(/^[a-z]+\./, "");
  const L: Record<string, string> = { issuance: "Security issued", issue: "Security issued", transfer: "Transfer", exercise: "Exercise",
    conversion: "Conversion", cancellation: "Cancellation", reversal: "Reversal", upload: "Document event", invite: "Access / invitation" };
  return L[k] ?? k.replace(/[._]/g, " ");
}

/* ---------------------------------------------------------------- overview */
export function overviewFigures(view: ReturnType<typeof ownershipView>, txs: WsTx[], docs: { status: string }[], classes: number) {
  const posted = txs.filter((t) => t.postingStatus === "posted").sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return {
    issued: view.summary.outstanding, fullyDiluted: view.summary.fullyDiluted,
    stakeholders: new Set(view.rows.filter((r) => r.fullyDiluted > 0).map((r) => r.id)).size,
    classes, pending: txs.filter((t) => t.postingStatus !== "posted").length, latest: posted[0] ?? null,
    docIssues: docs.filter((d) => /missing|rejected|needs|pending/.test(d.status)).length,
  };
}
