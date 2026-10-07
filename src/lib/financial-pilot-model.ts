/**
 * Financial Pilot Readiness (parallel pilot). Pure: no I/O.
 *
 * The pilot runs in PARALLEL MODE only: the fund's existing accounting
 * process stays authoritative and Harmonious results are validation output.
 * Nothing here migrates, posts, pays or changes official books.
 */

export type PilotStatus =
  | "evaluating"
  | "selected"
  | "opening_data"
  | "parallel_active"
  | "parallel_closed"
  | "parallel_passed"
  | "continue_parallel"
  | "requires_remediation"
  | "cutover_approved"
  | "withdrawn";

export const PILOT_STATUS_LABELS: Record<PilotStatus, string> = {
  evaluating: "Evaluating",
  selected: "Selected for pilot",
  opening_data: "Opening data",
  parallel_active: "Parallel period running",
  parallel_closed: "Parallel close complete",
  parallel_passed: "Parallel passed",
  continue_parallel: "Continue parallel",
  requires_remediation: "Requires remediation",
  cutover_approved: "Cutover approved (not implemented)",
  withdrawn: "Withdrawn",
};

const TRANSITIONS: Record<PilotStatus, PilotStatus[]> = {
  evaluating: ["selected", "withdrawn"],
  selected: ["opening_data", "withdrawn"],
  opening_data: ["parallel_active", "withdrawn"],
  parallel_active: ["parallel_closed", "withdrawn"],
  parallel_closed: ["parallel_passed", "requires_remediation"],
  parallel_passed: ["continue_parallel", "cutover_approved", "requires_remediation"],
  continue_parallel: ["parallel_active", "withdrawn"],
  requires_remediation: ["parallel_active", "withdrawn"],
  cutover_approved: [],
  withdrawn: [],
};

export function pilotTransitionError(from: PilotStatus, to: PilotStatus): string | null {
  return TRANSITIONS[from]?.includes(to) ? null : `A pilot that is ${PILOT_STATUS_LABELS[from]} cannot move to ${PILOT_STATUS_LABELS[to]}.`;
}

/* ---------------- Readiness ---------------- */

export type ReadinessLevel = "NOT_READY" | "READY_WITH_EXCEPTIONS" | "READY_FOR_PARALLEL_PILOT";
export type ReadinessItem = { section: string; key: string; label: string; ok: boolean; critical: boolean; detail: string };

export const CONTROL_ROLES = [
  "accounting_preparer",
  "accounting_reviewer",
  "nav_reviewer",
  "allocation_reviewer",
  "distribution_reviewer",
  "finance_payout",
  "close_reviewer",
] as const;
export type ControlRole = (typeof CONTROL_ROLES)[number];
export const LEAD_ROLES = ["primary_administrator", "accounting_lead", "relationship_lead"] as const;
export type PilotStaffRole = ControlRole | (typeof LEAD_ROLES)[number];

export const ROLE_LABELS: Record<PilotStaffRole, string> = {
  primary_administrator: "Primary administrator",
  accounting_lead: "Accounting lead",
  relationship_lead: "Relationship lead",
  accounting_preparer: "Accounting preparer",
  accounting_reviewer: "Accounting reviewer",
  nav_reviewer: "NAV reviewer",
  allocation_reviewer: "Allocation reviewer",
  distribution_reviewer: "Distribution reviewer",
  finance_payout: "Finance / payout",
  close_reviewer: "Close reviewer",
};

/** Pairs that must be different people (maker vs checker). */
export const SEGREGATED_PAIRS: [ControlRole, ControlRole][] = [
  ["accounting_preparer", "accounting_reviewer"],
  ["accounting_preparer", "nav_reviewer"],
  ["accounting_preparer", "allocation_reviewer"],
  ["accounting_preparer", "distribution_reviewer"],
  ["accounting_preparer", "close_reviewer"],
  ["distribution_reviewer", "finance_payout"],
  ["accounting_reviewer", "finance_payout"],
];

export function segregationConflicts(staff: Partial<Record<PilotStaffRole, string | null>>): string[] {
  const out: string[] = [];
  for (const [a, b] of SEGREGATED_PAIRS) {
    if (staff[a] && staff[a] === staff[b]) out.push(`${ROLE_LABELS[a]} and ${ROLE_LABELS[b]} are the same person.`);
  }
  return out;
}

export type ReadinessFacts = {
  fundClassification: string | null;
  fiscalYearEndMonth: number | null;
  accountingBasis: string | null;
  chartOfAccounts: number;
  serviceEngagement: boolean;
  staff: Partial<Record<PilotStaffRole, string | null>>;
  investors: number;
  kycComplete: number;
  kybRequired: number;
  kybComplete: number;
  taxDocsComplete: number;
  w9: number;
  w8: number;
  taxReviewExceptions: number;
  commitmentsRecorded: number;
  ownershipBasisVerified: boolean;
  payoutDestinationsRequired: number;
  payoutDestinationsVerified: number;
  openingBalanceCategories: string[];
  openingReconciled: boolean;
  openMigrationExceptions: number;
  bankAccounts: number;
  bankStatementAvailable: boolean;
  reconciliationConfigured: boolean;
  paymentExecutionMethod: string | null;
  bankDataSource: string | null;
  investmentPositions: number;
  investmentsCostLoaded: boolean;
  approvedWithholdingRules: number;
  withholdingRulesWithAdviserSource: number;
};

const REQUIRED_OPENING = ["trial_balance_debits", "trial_balance_credits", "cash", "investments_cost", "commitments", "called_capital", "uncalled_capital", "investor_capital", "liabilities", "nav_equity"] as const;

export function evaluateReadiness(f: ReadinessFacts): { level: ReadinessLevel; items: ReadinessItem[]; conflicts: string[] } {
  const items: ReadinessItem[] = [];
  const add = (section: string, key: string, label: string, ok: boolean, critical: boolean, detail: string) =>
    items.push({ section, key, label, ok, critical, detail });
  const n = f.investors;
  const all = (x: number) => n > 0 && x >= n;

  add("Fund setup", "classification", "Fund classification", Boolean(f.fundClassification), false, f.fundClassification ?? "Not set");
  add("Fund setup", "fiscal_year", "Fiscal year", f.fiscalYearEndMonth != null, false, f.fiscalYearEndMonth ? `Ends month ${f.fiscalYearEndMonth}` : "Not set");
  add("Fund setup", "basis", "Accounting basis", Boolean(f.accountingBasis), true, f.accountingBasis ?? "No ledger book");
  add("Fund setup", "coa", "Chart of accounts", f.chartOfAccounts > 0, true, `${f.chartOfAccounts} account(s)`);
  add("Fund setup", "engagement", "Service engagement", f.serviceEngagement, false, f.serviceEngagement ? "Active" : "None");
  for (const r of LEAD_ROLES) add("Fund setup", r, ROLE_LABELS[r], Boolean(f.staff[r]), r === "accounting_lead", f.staff[r] ? "Assigned" : "Unassigned");

  add("Investors", "count", "Investors", n > 0, true, `${n}`);
  add("Investors", "kyc", "KYC complete", all(f.kycComplete), true, `${f.kycComplete} of ${n}`);
  add("Investors", "kyb", "KYB complete where applicable", f.kybComplete >= f.kybRequired, true, f.kybRequired ? `${f.kybComplete} of ${f.kybRequired}` : "Not applicable");
  add("Investors", "tax_docs", "Tax documentation complete", all(f.taxDocsComplete), true, `${f.taxDocsComplete} of ${n}`);
  add("Investors", "commitments", "Commitments recorded", all(f.commitmentsRecorded), true, `${f.commitmentsRecorded} of ${n}`);
  add("Investors", "ownership", "Ownership/allocation basis verified", f.ownershipBasisVerified, true, f.ownershipBasisVerified ? "Verified" : "Not verified against source records");
  add("Investors", "payout_dest", "Payout destinations verified where required", f.payoutDestinationsVerified >= f.payoutDestinationsRequired, false, f.payoutDestinationsRequired ? `${f.payoutDestinationsVerified} of ${f.payoutDestinationsRequired}` : "None required for comparison");

  const missing = REQUIRED_OPENING.filter((c) => !f.openingBalanceCategories.includes(c));
  add("Accounting", "opening", "Opening balances entered with source documents", missing.length === 0, true, missing.length ? `Missing: ${missing.join(", ").replace(/_/g, " ")}` : "All required categories");
  add("Accounting", "opening_rec", "Opening balances reconciled", f.openingReconciled, true, f.openingReconciled ? "Ties" : "Not reconciled");
  add("Accounting", "migration_exceptions", "Migration exceptions resolved", f.openMigrationExceptions === 0, true, `${f.openMigrationExceptions} open`);
  add("Accounting", "positions", "Investment positions loaded", f.investmentPositions > 0, true, `${f.investmentPositions}`);
  add("Accounting", "cost", "Cost basis loaded", f.investmentsCostLoaded, true, f.investmentsCostLoaded ? "Loaded" : "Missing on one or more positions");

  add("Tax / withholding", "policy", "Approved withholding policy", f.approvedWithholdingRules > 0, true, `${f.approvedWithholdingRules} approved rule(s)`);
  add("Tax / withholding", "adviser", "Tax adviser / source recorded on rules", f.approvedWithholdingRules > 0 && f.withholdingRulesWithAdviserSource >= f.approvedWithholdingRules, true, `${f.withholdingRulesWithAdviserSource} of ${f.approvedWithholdingRules}`);
  add("Tax / withholding", "w9w8", "W-9 / W-8 status", f.w9 + f.w8 >= n && n > 0, false, `W-9 ${f.w9} · W-8 ${f.w8}`);
  add("Tax / withholding", "tax_exceptions", "No open tax-review exceptions", f.taxReviewExceptions === 0, false, `${f.taxReviewExceptions} open`);

  add("Banking", "bank", "Bank account configured", f.bankAccounts > 0, true, `${f.bankAccounts}`);
  add("Banking", "statement", "Bank statement available", f.bankStatementAvailable, true, f.bankStatementAvailable ? "Yes" : "No reviewed statement balance");
  add("Banking", "recon", "Reconciliation process configured", f.reconciliationConfigured, false, f.reconciliationConfigured ? "Yes" : "No");
  add("Banking", "exec", "Payment execution method", Boolean(f.paymentExecutionMethod), false, f.paymentExecutionMethod ?? "Not set");
  add("Banking", "source", "Bank-data source", Boolean(f.bankDataSource), false, f.bankDataSource ?? "Not set");

  for (const r of CONTROL_ROLES) add("Controls", r, ROLE_LABELS[r], Boolean(f.staff[r]), true, f.staff[r] ? "Assigned" : "Unassigned");
  const conflicts = segregationConflicts(f.staff);
  add("Controls", "segregation", "Segregation of duties", conflicts.length === 0, true, conflicts.length ? conflicts.join(" ") : "No conflicts");

  const criticalFail = items.some((i) => i.critical && !i.ok);
  const anyFail = items.some((i) => !i.ok);
  return { level: criticalFail ? "NOT_READY" : anyFail ? "READY_WITH_EXCEPTIONS" : "READY_FOR_PARALLEL_PILOT", items, conflicts };
}

/* ---------------- Candidate scoring ---------------- */

export type CandidateFactors = {
  investorCount: number;
  entityComplexity: 0 | 1 | 2 | 3; // 0 simple LP/LLC .. 3 feeder/blocker/parallel
  investmentCount: number;
  monthlyTransactions: number;
  bankAccountCount: number;
  sideLetters: number;
  waterfallTiers: number;
  internationalInvestors: number;
  taxComplexity: 0 | 1 | 2 | 3;
  historicalCompleteness: 0 | 1 | 2 | 3; // 3 = complete
  dataQuality: 0 | 1 | 2 | 3; // 3 = clean
  outstandingExceptions: number;
  multiCurrency: boolean;
  hasFeederBlockerOrParallel: boolean;
  unusualTaxAllocation: boolean;
  nextCloseIsQuarterOrYearEnd: boolean;
};

const band = (v: number, cuts: number[]) => cuts.filter((c) => v > c).length;

/** Lower is simpler. Disqualifiers make a fund unsuitable for the FIRST pilot. */
export function scoreCandidate(f: CandidateFactors): { total: number; parts: Record<string, number>; disqualifiers: string[] } {
  const parts: Record<string, number> = {
    investors: band(f.investorCount, [10, 25, 50, 100]),
    entity: f.entityComplexity,
    investments: band(f.investmentCount, [1, 3, 8, 15]),
    transactions: band(f.monthlyTransactions, [10, 30, 75]),
    bankAccounts: band(f.bankAccountCount, [1, 2, 4]),
    sideLetters: band(f.sideLetters, [0, 2, 5]),
    waterfall: band(f.waterfallTiers, [1, 2, 3]),
    international: band(f.internationalInvestors, [0, 2, 5]),
    tax: f.taxComplexity,
    history: 3 - f.historicalCompleteness,
    data: 3 - f.dataQuality,
    exceptions: band(f.outstandingExceptions, [0, 2, 5]),
    timing: f.nextCloseIsQuarterOrYearEnd ? 1 : 0,
  };
  const disqualifiers: string[] = [];
  if (f.multiCurrency) disqualifiers.push("More than one currency");
  if (f.hasFeederBlockerOrParallel || f.entityComplexity >= 3) disqualifiers.push("Feeder, blocker or parallel vehicle");
  if (f.waterfallTiers > 2) disqualifiers.push("Multi-tier waterfall");
  if (f.sideLetters > 2) disqualifiers.push("Complicated side letters");
  if (f.unusualTaxAllocation) disqualifiers.push("Unusual tax allocation");
  if (f.outstandingExceptions > 0) disqualifiers.push("Unresolved accounting issues");
  if (f.historicalCompleteness < 2) disqualifiers.push("Incomplete accounting history");
  return { total: Object.values(parts).reduce((t, v) => t + v, 0), parts, disqualifiers };
}

/** Recommend the lowest-complexity suitable candidate. Never enrolls. */
export function recommendCandidate<T extends { offeringId: string; total: number; disqualifiers: string[] }>(rows: readonly T[]): T | null {
  return [...rows].filter((r) => r.disqualifiers.length === 0).sort((a, b) => a.total - b.total)[0] ?? null;
}

/* ---------------- Opening balances & variances ---------------- */

export type OpeningFacts = Record<string, number | undefined>;

/** Structural opening checks. Every failure must become a migration exception, never a plug. */
export function openingReconciliation(official: OpeningFacts, harmonious: { tbDebits: number; tbCredits: number; cash: number; investmentsCost: number; investorCapital: number; commitments: number; called: number }) {
  const checks: { metric: string; official: number; harmonious: number; ok: boolean; structural: boolean }[] = [];
  const c = (metric: string, o: number | undefined, h: number, structural = true) => checks.push({ metric, official: o ?? 0, harmonious: h, ok: o !== undefined && o === h, structural });
  checks.push({ metric: "Imported trial balance balances", official: official['trial_balance_debits'] ?? 0, harmonious: official['trial_balance_credits'] ?? 0, ok: official['trial_balance_debits'] !== undefined && official['trial_balance_debits'] === official['trial_balance_credits'], structural: true });
  c("Trial balance debits", official['trial_balance_debits'], harmonious.tbDebits);
  c("Cash", official['cash'], harmonious.cash);
  c("Investments at cost", official['investments_cost'], harmonious.investmentsCost);
  c("Investor capital", official['investor_capital'], harmonious.investorCapital);
  c("Commitments", official['commitments'], harmonious.commitments);
  c("Called capital", official['called_capital'], harmonious.called);
  const calledPlusUncalled = (official['called_capital'] ?? 0) + (official['uncalled_capital'] ?? 0);
  checks.push({ metric: "Called + uncalled = commitments", official: official['commitments'] ?? 0, harmonious: calledPlusUncalled, ok: official['commitments'] !== undefined && calledPlusUncalled === official['commitments'], structural: true });
  return { checks, ties: checks.every((x) => x.ok) };
}

export const VARIANCE_CLASSES = ["data_migration", "timing", "accounting_policy", "configuration", "calculation_defect", "workflow_defect", "source_system_error", "expected_difference", "unknown"] as const;
export type VarianceClass = (typeof VARIANCE_CLASSES)[number];

/** Metrics whose reconciliation is structural: no materiality threshold may hide a difference. */
export const STRUCTURAL_METRICS = ["trial_balance", "allocations_vs_nav", "capital_call_allocation", "distribution_allocation", "cash_vs_bank"] as const;

export function isStructural(metric: string) {
  return (STRUCTURAL_METRICS as readonly string[]).includes(metric);
}

/** Whether a variance can be treated as within tolerance. Structural metrics: never. */
export function withinTolerance(metric: string, varianceCents: number, toleranceCents: number) {
  if (isStructural(metric)) return varianceCents === 0;
  return Math.abs(varianceCents) <= Math.max(0, toleranceCents);
}

export function varianceResolutionError(v: { raised_by: string; status: string; classification: string; structural: boolean }, input: { reviewerId: string; status: "resolved" | "accepted"; resolution: string; classification: string }): string | null {
  if (v.status !== "open") return "This variance is already closed.";
  if (input.reviewerId === v.raised_by) return "A variance must be resolved by someone other than the person who raised it.";
  if (input.resolution.trim().length < 10) return "Describe the resolution (at least 10 characters).";
  if (input.classification === "unknown") return "Classify the cause before resolving.";
  if (input.status === "accepted" && v.structural) return "A structural reconciliation difference cannot be accepted; resolve the underlying cause with a documented, reviewed journal.";
  if (input.status === "accepted" && input.classification !== "expected_difference" && input.classification !== "timing" && input.classification !== "accounting_policy") {
    return "Only expected, timing or accounting-policy differences can be accepted without correction.";
  }
  return null;
}

/* ---------------- Sign-off and decision ---------------- */

export const SIGNOFF_ROLES = ["accounting_lead", "operations_admin", "finance_controller", "leadership"] as const;
export type SignoffRole = (typeof SIGNOFF_ROLES)[number];
export const SIGNOFF_CONFIRMATIONS = [
  "opening_balances_reconciled",
  "transactions_complete",
  "cash_reconciled",
  "nav_reconciled",
  "capital_accounts_reconciled",
  "material_variances_resolved",
  "controls_operated",
  "reports_reviewed",
  "no_unexplained_plugs",
] as const;

export function signoffError(existing: readonly { role_key: string; user_id: string }[], input: { role: SignoffRole; userId: string; confirmations: Record<string, boolean> }): string | null {
  if (existing.some((s) => s.role_key === input.role)) return "This sign-off role is already signed.";
  if (existing.some((s) => s.user_id === input.userId)) return "Each sign-off must be a different person.";
  const missing = SIGNOFF_CONFIRMATIONS.filter((k) => !input.confirmations[k]);
  if (missing.length) return `Confirm every item before signing: ${missing.join(", ").replace(/_/g, " ")}.`;
  return null;
}

export function parallelPassBlockers(f: { signoffRoles: string[]; openVariances: number; openStructural: number; closeApproved: boolean }): string[] {
  const out: string[] = [];
  for (const r of SIGNOFF_ROLES) if (!f.signoffRoles.includes(r)) out.push(`Missing ${r.replace(/_/g, " ")} sign-off`);
  if (f.openVariances > 0) out.push(`${f.openVariances} open variance(s)`);
  if (f.openStructural > 0) out.push(`${f.openStructural} structural difference(s)`);
  if (!f.closeApproved) out.push("Parallel month-end close not approved");
  return out;
}

/** The decision after a passed parallel close. Cutover approval is recorded only; nothing switches automatically. */
export function decisionTarget(decision: "continue_parallel" | "approve_production_cutover" | "requires_remediation"): PilotStatus {
  return decision === "continue_parallel" ? "continue_parallel" : decision === "requires_remediation" ? "requires_remediation" : "cutover_approved";
}

/** Known security gates that must be addressed separately before any production cutover. */
export const SECURITY_GATES = [
  "Central authorization enforcement (canonical RBAC still in shadow mode)",
  "High-risk re-authentication for money and access actions",
  "Cross-client Operations visibility narrowed to assigned book",
  "Super Admin self-approval monitoring and review",
] as const;
