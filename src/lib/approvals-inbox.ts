/**
 * Pure rules for the one Approvals inbox. The inbox only reads items the
 * work queue already authorized; it never approves anything itself.
 */

/** An approval waiting this many days or more is flagged as stalled. */
export const APPROVAL_STALL_DAYS = 3;

export type InboxItem = {
  id: string;
  title: string;
  requiredAction: string;
  fundId?: string | null;
  fundName?: string | null;
  clientName?: string | null;
  investorName?: string | null;
  at?: string | null;
};

export function isApprovalItem(i: Pick<InboxItem, "requiredAction">) {
  return i.requiredAction === "approve" || i.requiredAction === "review";
}

export function waitingDays(at: string | null | undefined, now: Date = new Date()) {
  if (!at) return 0;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function isStalledApproval(at: string | null | undefined, now: Date = new Date()) {
  return waitingDays(at, now) >= APPROVAL_STALL_DAYS;
}

/** Case-insensitive match on title, fund, client or investor. */
export function matchesSearch(i: InboxItem, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [i.title, i.fundName, i.clientName, i.investorName].some((v) => String(v ?? "").toLowerCase().includes(needle));
}

/** Oldest first, so nothing sits at the bottom forgotten. */
export function sortOldestFirst<T extends InboxItem>(items: T[]) {
  return [...items].sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
}
