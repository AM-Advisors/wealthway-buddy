/**
 * Bank alert detection. Pure: given bank facts, return the alerts that should
 * exist. Alerts are signals for staff - resolving one never changes a bank
 * record, and nothing here moves money.
 */
export type AlertKind = "unmatched_deposit" | "balance_mismatch" | "feed_stale" | "unexpected_withdrawal";

export const ALERT_LABELS: Record<AlertKind, string> = {
  unmatched_deposit: "Unmatched deposit",
  balance_mismatch: "Balance differs from ledger",
  feed_stale: "Bank feed not updating",
  unexpected_withdrawal: "Unexpected withdrawal",
};

export type DetectedAlert = {
  kind: AlertKind;
  dedupeKey: string;
  bankTransactionId?: string | null;
  bankAccountId?: string | null;
  amountCents?: number | null;
  detail: Record<string, unknown>;
};

export type DepositFact = {
  id: string;
  posted_on: string;
  amount_cents: number;
  name: string | null;
  matched_application_id: string | null;
  matched_invoice_id: string | null;
  matched_wire_request_id: string | null;
  /** True when the canonical reconciliation engine has reconciled or posted this item. */
  reconciled?: boolean;
};
export type WithdrawalFact = { plaidId: string; date: string; amountCents: number; name: string };
export type ApprovedPaymentFact = { amountCents: number; date: string };
export type AccountFact = { id: string; status: string | null; last_synced_at: string | null; institution_name: string | null; account_mask: string | null };

export const DEFAULTS = { unmatchedDays: 3, staleDays: 3, balanceToleranceCents: 100, paymentWindowDays: 7 };
const DAY = 86_400_000;
const days = (from: string, now: Date) => Math.floor((now.getTime() - new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime()) / DAY);

export function detectAlerts(input: {
  offeringId: string;
  now: Date;
  deposits?: readonly DepositFact[];
  withdrawals?: readonly WithdrawalFact[];
  approvedPayments?: readonly ApprovedPaymentFact[];
  accounts?: readonly AccountFact[];
  bankBalanceCents?: number | null;
  balanceAsOf?: string | null;
  ledgerCashCents?: number | null;
  unmatchedDays?: number;
}): DetectedAlert[] {
  const o = input.offeringId;
  const out: DetectedAlert[] = [];
  const threshold = input.unmatchedDays ?? DEFAULTS.unmatchedDays;

  for (const d of input.deposits ?? []) {
    const matched = d.reconciled || d.matched_application_id || d.matched_invoice_id || d.matched_wire_request_id;
    const age = days(d.posted_on, input.now);
    if (!matched && age > threshold) {
      out.push({ kind: "unmatched_deposit", dedupeKey: `${o}:deposit:${d.id}`, bankTransactionId: d.id, amountCents: d.amount_cents, detail: { name: d.name, postedOn: d.posted_on, ageDays: age } });
    }
  }

  const pool = [...(input.approvedPayments ?? [])];
  for (const w of input.withdrawals ?? []) {
    const i = pool.findIndex((p) => p.amountCents === w.amountCents && Math.abs(days(p.date, new Date(`${w.date}T00:00:00Z`))) <= DEFAULTS.paymentWindowDays);
    if (i >= 0) { pool.splice(i, 1); continue; }
    out.push({ kind: "unexpected_withdrawal", dedupeKey: `${o}:withdrawal:${w.plaidId}`, amountCents: w.amountCents, detail: { name: w.name, date: w.date } });
  }

  for (const a of input.accounts ?? []) {
    const needs = a.status === "needs_attention" || a.status === "login_required" || a.status === "error";
    const age = a.last_synced_at ? days(a.last_synced_at, input.now) : null;
    if (needs || age === null || age > DEFAULTS.staleDays) {
      const bucket = needs ? `status:${a.status}` : `since:${a.last_synced_at?.slice(0, 10) ?? "never"}`;
      out.push({ kind: "feed_stale", dedupeKey: `${o}:feed:${a.id}:${bucket}`, bankAccountId: a.id, detail: { status: a.status, lastSyncedAt: a.last_synced_at, ageDays: age, bank: a.institution_name, mask: a.account_mask } });
    }
  }

  if (input.bankBalanceCents != null && input.ledgerCashCents != null && input.balanceAsOf) {
    const diff = input.bankBalanceCents - input.ledgerCashCents;
    if (Math.abs(diff) > DEFAULTS.balanceToleranceCents) {
      out.push({ kind: "balance_mismatch", dedupeKey: `${o}:balance:${input.balanceAsOf}`, amountCents: diff, detail: { bankCents: input.bankBalanceCents, ledgerCents: input.ledgerCashCents, asOf: input.balanceAsOf } });
    }
  }
  return out;
}

export type AlertEvent = { action: "acknowledged" | "assigned" | "resolved" | "reopened"; created_at: string; actor_user_id: string; assignee_user_id?: string | null; note?: string | null };
export type AlertState = "open" | "acknowledged" | "resolved";

/** Current state is derived from the append-only event history. */
export function alertState(events: readonly AlertEvent[]): { state: AlertState; assignee: string | null } {
  let state: AlertState = "open";
  let assignee: string | null = null;
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.action === "acknowledged") state = "acknowledged";
    if (e.action === "assigned") { assignee = e.assignee_user_id ?? null; if (state === "open") state = "acknowledged"; }
    if (e.action === "resolved") state = "resolved";
    if (e.action === "reopened") state = "open";
  }
  return { state, assignee };
}

export function canApplyAlertAction(state: AlertState, action: AlertEvent["action"], note?: string | null): string | null {
  if (action === "resolved" && !note?.trim()) return "Explain how the alert was resolved.";
  if (action === "reopened" && state !== "resolved") return "Only a resolved alert can be reopened.";
  if (action !== "reopened" && state === "resolved") return "This alert is resolved. Reopen it first.";
  if (action === "reopened" && !note?.trim()) return "Say why the alert is being reopened.";
  return null;
}
