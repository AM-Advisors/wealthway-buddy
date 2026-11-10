/**
 * Outstanding bookkeeping items for one fund (pure, browser-safe).
 * A read-only projection of existing records: statement uploads and lines, reconciliation
 * information requests, open accounting exceptions, close checklists and Bookkeeping Review
 * requests recorded by Harmonious. It never changes records, infers completion or exposes
 * internal notes; every item is either something the client needs to provide or something
 * Harmonious is working on.
 */

export type OutstandingOwner = "client" | "harmonious";
export type OutstandingCategory = "statement" | "explanation" | "document" | "review" | "close";

export interface OutstandingItem {
  key: string;
  owner: OutstandingOwner;
  category: OutstandingCategory;
  title: string;
  detail: string | null;
  /** Dated rows shown under the item (for example transactions to explain). */
  lines?: { date: string | null; text: string; amountCents: number | null }[];
  since: string | null;
  dueOn: string | null;
  /** Set for Bookkeeping Review requests, so the client can respond and staff can follow up. */
  requestId?: string;
}

export interface OutstandingFacts {
  asOf: string;
  uploads: { period_start: string | null; period_end: string | null; bank_name: string | null; account_mask: string | null; status: string }[];
  lines: { id: string; posted_on: string | null; description: string | null; amount_cents: number | null; direction: string | null; skip: boolean | null; duplicate_of: string | null; confirmed_category: string | null; matched_onboarding_id: string | null; matched_asset_id: string | null; matched_vendor: string | null; applied_tx_id: string | null }[];
  infoRequests: { id: string; information_request: string | null; information_requested_at: string | null }[];
  exceptions: { id: string; kind: string; opened_at: string | null }[];
  checklist: { period_end: string | null; label: string; blocking: boolean; status: string }[];
  reviewRequests: { id: string; title: string; requested_information: string | null; responsibility_status: string | null; responsibility_note_client: string | null; due_date: string | null; created_at: string | null; status: string }[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
function nextMonth(key: string) {
  const y = Number(key.slice(0, 4)); const m = Number(key.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
function previousMonth(key: string) {
  const y = Number(key.slice(0, 4)); const m = Number(key.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const accountLabel = (u: { bank_name: string | null; account_mask: string | null }) =>
  [u.bank_name?.trim() || "Bank account", u.account_mask ? `ending ${String(u.account_mask).replace(/\D/g, "").slice(-4)}` : null].filter(Boolean).join(" ");

/**
 * Months with no statement on file, per account, from the first statement on file
 * through the last complete month. Accounts are only known once one statement exists.
 */
export function missingStatementMonths(uploads: OutstandingFacts["uploads"], asOf: string, maxMonths = 24) {
  const lastComplete = previousMonth(monthKey(asOf));
  const byAccount = new Map<string, { label: string; covered: Set<string>; first: string }>();
  for (const u of uploads) {
    if (!u.period_start || !u.period_end) continue;
    const id = `${(u.bank_name ?? "").trim().toLowerCase()}|${String(u.account_mask ?? "").replace(/\D/g, "").slice(-4)}`;
    const entry = byAccount.get(id) ?? { label: accountLabel(u), covered: new Set<string>(), first: monthKey(u.period_start) };
    if (monthKey(u.period_start) < entry.first) entry.first = monthKey(u.period_start);
    for (let k = monthKey(u.period_start); k <= monthKey(u.period_end); k = nextMonth(k)) entry.covered.add(k);
    byAccount.set(id, entry);
  }
  const out: { account: string; months: string[] }[] = [];
  for (const a of byAccount.values()) {
    const months: string[] = [];
    for (let k = a.first; k <= lastComplete; k = nextMonth(k)) if (!a.covered.has(k)) months.push(k);
    if (months.length) out.push({ account: a.label, months: months.slice(-maxMonths) });
  }
  return out;
}

/** Statement lines nobody has explained yet: not skipped, not duplicates, not assigned or applied. */
export function unexplainedLines(lines: OutstandingFacts["lines"]) {
  return lines.filter((l) => !l.skip && !l.duplicate_of && !l.confirmed_category && !l.matched_onboarding_id && !l.matched_asset_id && !l.matched_vendor && !l.applied_tx_id);
}

/** Exception kinds only the client can answer: who paid or what a payment was for. */
const CLIENT_EXCEPTION = new Set(["unknown_counterparty", "missing_investor", "unmatched_cash"]);

export function buildOutstandingItems(f: OutstandingFacts): OutstandingItem[] {
  const items: OutstandingItem[] = [];

  for (const r of f.reviewRequests) {
    if (r.status === "done" || r.status === "cancelled") continue;
    const waitingOnClient = r.responsibility_status === "CLIENT_INFORMATION_REQUIRED";
    items.push({
      key: `request:${r.id}`, requestId: r.id, owner: waitingOnClient ? "client" : "harmonious", category: "review",
      title: waitingOnClient ? r.title : `Reviewing what you sent: ${r.title}`,
      detail: waitingOnClient ? r.requested_information : r.responsibility_note_client,
      since: r.created_at?.slice(0, 10) ?? null, dueOn: waitingOnClient ? r.due_date : null,
    });
  }

  for (const gap of missingStatementMonths(f.uploads, f.asOf)) {
    items.push({
      key: `statements:${gap.account}`, owner: "client", category: "statement",
      title: `Upload ${gap.account} statements`,
      detail: gap.months.length === 1 ? `Missing: ${monthLabel(gap.months[0]!)}.` : `Missing ${gap.months.length} months: ${gap.months.map(monthLabel).join(", ")}.`,
      since: `${gap.months[0]}-01`, dueOn: null,
    });
  }

  const unexplained = unexplainedLines(f.lines).sort((a, b) => String(a.posted_on ?? "").localeCompare(String(b.posted_on ?? "")));
  if (unexplained.length) {
    items.push({
      key: "lines", owner: "client", category: "explanation",
      title: unexplained.length === 1 ? "Tell us what 1 transaction was for" : `Tell us what ${unexplained.length} transactions were for`,
      detail: "From your uploaded bank statements. A short note per transaction is enough, plus a receipt or invoice if you have one.",
      lines: unexplained.slice(0, 25).map((l) => ({ date: l.posted_on, text: l.description?.trim() || "No description", amountCents: l.amount_cents === null ? null : (l.direction === "out" || l.direction === "debit" ? -1 : 1) * Math.abs(Number(l.amount_cents)) })),
      since: unexplained[0]!.posted_on, dueOn: null,
    });
  }

  for (const q of f.infoRequests) {
    items.push({
      key: `info:${q.id}`, owner: "client", category: "explanation", title: "Answer a question about a bank transaction",
      detail: q.information_request?.trim() || "Harmonious needs more detail about this transaction.",
      since: q.information_requested_at?.slice(0, 10) ?? null, dueOn: null,
    });
  }

  const clientExceptions = f.exceptions.filter((e) => CLIENT_EXCEPTION.has(e.kind));
  const teamExceptions = f.exceptions.filter((e) => !CLIENT_EXCEPTION.has(e.kind));
  if (clientExceptions.length) {
    items.push({
      key: "exceptions:client", owner: "client", category: "explanation",
      title: clientExceptions.length === 1 ? "Identify 1 payment we couldn't match" : `Identify ${clientExceptions.length} payments we couldn't match`,
      detail: "Tell us who sent or received each payment and what it was for.",
      since: oldest(clientExceptions.map((e) => e.opened_at)), dueOn: null,
    });
  }
  if (teamExceptions.length) {
    items.push({
      key: "exceptions:team", owner: "harmonious", category: "review",
      title: teamExceptions.length === 1 ? "Resolving 1 accounting item" : `Resolving ${teamExceptions.length} accounting items`,
      detail: "Nothing needed from you unless we ask.", since: oldest(teamExceptions.map((e) => e.opened_at)), dueOn: null,
    });
  }

  const openSteps = new Map<string, number>();
  for (const c of f.checklist) if (c.blocking && !["done", "complete", "completed", "waived"].includes(c.status) && c.period_end) openSteps.set(c.period_end, (openSteps.get(c.period_end) ?? 0) + 1);
  for (const [periodEnd, count] of [...openSteps.entries()].sort()) {
    items.push({
      key: `close:${periodEnd}`, owner: "harmonious", category: "close",
      title: `Closing the period ending ${periodEnd}`, detail: `${count} close ${count === 1 ? "step" : "steps"} left.`, since: periodEnd, dueOn: null,
    });
  }

  return items.sort((a, b) => (a.owner === b.owner ? String(a.since ?? "").localeCompare(String(b.since ?? "")) : a.owner === "client" ? -1 : 1));
}

function oldest(values: (string | null)[]) {
  const v = values.filter(Boolean).map((x) => String(x).slice(0, 10)).sort();
  return v[0] ?? null;
}

export function outstandingSummary(items: OutstandingItem[]) {
  const client = items.filter((i) => i.owner === "client");
  return { needFromYou: client.length, harmoniousWorking: items.length - client.length, oldestClientItem: oldest(client.map((i) => i.since)) };
}
