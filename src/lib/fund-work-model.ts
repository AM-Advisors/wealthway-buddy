/**
 * Pure registry and normalizer for a fund's "Open items" list. Read-only projection:
 * every row links back to the screen that already handles it; nothing here approves or sends.
 */
export type FundWorkSide = "manager" | "harmonious" | "investor" | "other";
export type FundWorkTab = "requests" | "closes" | "regulatory" | "approvals" | "documents" | "banking" | "investors" | "setup" | "accounting";
export type FundWorkSourceKey =
  | "service_requests" | "staff_tasks" | "fund_setup_requests" | "fund_intakes" | "close_requests"
  | "fee_terms" | "side_letter_changes" | "locked_edits" | "document_changes"
  | "investor_signatures" | "fund_file_signatures" | "ss4_signatures" | "w9_signatures"
  | "investor_todos" | "close_filings" | "state_filings" | "franchise_fees"
  | "bank_setup" | "wire_requests" | "reopen_requests" | "migration_requests" | "pricing_approvals";

export type FundWorkSource = { key: FundWorkSourceKey; table: string; label: string; tab: FundWorkTab; staffOnly?: boolean };

export const FUND_WORK_SOURCES: readonly FundWorkSource[] = [
  { key: "service_requests", table: "fund_service_requests", label: "Service request", tab: "requests" },
  { key: "staff_tasks", table: "staff_tasks", label: "Harmonious task", tab: "requests", staffOnly: true },
  { key: "fund_setup_requests", table: "fund_requests", label: "Fund setup request", tab: "setup" },
  { key: "fund_intakes", table: "client_fund_intakes", label: "New fund details", tab: "setup" },
  { key: "close_requests", table: "fund_close_requests", label: "Close", tab: "closes" },
  { key: "fee_terms", table: "fund_fee_terms", label: "Fee terms change", tab: "approvals" },
  { key: "side_letter_changes", table: "side_letter_change_requests", label: "Side letter change", tab: "approvals" },
  { key: "locked_edits", table: "locked_edit_requests", label: "Change to locked details", tab: "approvals" },
  { key: "document_changes", table: "offering_document_change_requests", label: "Document change", tab: "documents" },
  { key: "investor_signatures", table: "document_signature_signers", label: "Signature waiting", tab: "investors" },
  { key: "fund_file_signatures", table: "fund_file_signatures", label: "Fund document signature", tab: "documents" },
  { key: "ss4_signatures", table: "ss4_signature_requests", label: "SS-4 signature", tab: "setup" },
  { key: "w9_signatures", table: "fund_w9_signature_requests", label: "Fund W-9 signature", tab: "setup" },
  { key: "investor_todos", table: "investment_readiness_tasks", label: "Investor to-do", tab: "investors" },
  { key: "close_filings", table: "fund_close_filings", label: "Close filing", tab: "closes" },
  { key: "state_filings", table: "fund_state_filings", label: "State filing", tab: "regulatory" },
  { key: "franchise_fees", table: "fund_franchise_fees", label: "Franchise fee", tab: "regulatory" },
  { key: "bank_setup", table: "offering_bank_setup_requests", label: "Bank setup", tab: "banking" },
  { key: "wire_requests", table: "wire_requests", label: "Wire request", tab: "banking" },
  { key: "reopen_requests", table: "fund_reopen_requests", label: "Reopen request", tab: "setup" },
  { key: "migration_requests", table: "fund_migration_requests", label: "Migration", tab: "setup", staffOnly: true },
  { key: "pricing_approvals", table: "pricing_approval_requests", label: "Pricing approval", tab: "accounting", staffOnly: true },
];

export type FundWorkItem = {
  id: string; source: FundWorkSourceKey; label: string; title: string; status: string;
  side: FundWorkSide; due: string | null; at: string; tab: FundWorkTab; onboardingId: string | null;
};
export type RawFundWork = { id: string; title?: string | null; status?: string | null; side: FundWorkSide; due?: string | null; at: string; onboardingId?: string | null };

const nice = (v: string) => v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function sourcesFor(staff: boolean) {
  return FUND_WORK_SOURCES.filter((s) => staff || !s.staffOnly);
}

export function normalizeFundWork(key: FundWorkSourceKey, rows: RawFundWork[], staff: boolean): FundWorkItem[] {
  const src = FUND_WORK_SOURCES.find((s) => s.key === key);
  if (!src || (src.staffOnly && !staff)) return [];
  return rows.map((r) => ({
    id: `${key}:${r.id}`, source: key, label: src.label, title: r.title?.trim() || src.label,
    status: r.status ? nice(r.status) : "Open", side: r.side, due: r.due ?? null, at: r.at, tab: src.tab, onboardingId: r.onboardingId ?? null,
  }));
}

/** Group for the viewer: "you" means the viewer's own side (staff → Harmonious, manager → fund manager). */
export function groupFor(item: Pick<FundWorkItem, "side">, staff: boolean): "you" | "harmonious" | "waiting" {
  if (item.side === (staff ? "harmonious" : "manager")) return "you";
  if (item.side === "harmonious") return "harmonious";
  return "waiting";
}

export function sortFundWork(items: FundWorkItem[]) {
  return [...items].sort((a, b) => (a.due ?? "9999") < (b.due ?? "9999") ? -1 : (a.due ?? "9999") > (b.due ?? "9999") ? 1 : a.at < b.at ? 1 : -1);
}
