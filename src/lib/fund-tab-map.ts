/**
 * Fund page tab layout: ten top tabs (Requests and Activity combined) (Close and Compliance on their own), each with at most one row of sub-views,
 * so every fund detail is at most two clicks away. Old tab addresses map to
 * their single new home so bookmarks and emailed links keep working.
 * Bank statements and transactions are separate Banking sub-views.
 */
export type FundTopTab = { value: string; label: string; group: string[] };

export const FUND_TOP_TABS: FundTopTab[] = [
  { value: "overview", label: "Overview", group: ["overview"] },
  { value: "setup", label: "Setup", group: ["setup", "formation"] },
  { value: "investors", label: "Investors", group: ["investors"] },
  { value: "documents", label: "Documents", group: ["documents"] },
  { value: "approvals", label: "Approvals", group: ["approvals"] },
  { value: "banking", label: "Banking", group: ["banking", "statements", "transactions"] },
  { value: "closes", label: "Close", group: ["closes"] },
  { value: "regulatory", label: "Compliance", group: ["regulatory"] },
  { value: "accounting", label: "Accounting", group: ["accounting", "distributions", "assets", "services", "forecasts"] },
  { value: "activity", label: "Activity & requests", group: ["open", "requests", "audit", "calendar", "record"] },
];

export const FUND_SUB_LABEL: Record<string, string> = {
  setup: "Setup steps", formation: "Formation & EIN",
  approvals: "Approvals", open: "Open items", requests: "Requests",
  banking: "Accounts & wires", statements: "Bank statements", transactions: "Bank transactions",
  accounting: "Accounting", closes: "Closes", distributions: "Distributions", assets: "Assets", services: "Services", forecasts: "Forecasts",
  audit: "History", calendar: "Calendar", regulatory: "Compliance", record: "Record",
};

/** Old or shorthand tab values → the one place that detail now lives. */
const REDIRECT: Record<string, string> = {
  details: "setup", team: "setup", todos: "overview", activity: "open", capital: "distributions", payments: "accounting",
  bank_statements: "statements", bank_transactions: "transactions",
};

export function normalizeFundTab(tab: string | null | undefined): string {
  const t = String(tab ?? "").trim() || "overview";
  const mapped = REDIRECT[t] ?? t;
  return FUND_TOP_TABS.some((p) => p.group.includes(mapped)) ? mapped : "overview";
}

export function topTabFor(tab: string): FundTopTab {
  const t = normalizeFundTab(tab);
  return FUND_TOP_TABS.find((p) => p.group.includes(t)) ?? FUND_TOP_TABS[0]!;
}
