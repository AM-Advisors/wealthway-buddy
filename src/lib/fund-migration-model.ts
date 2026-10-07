/**
 * Fund migration (take-over of an existing fund's books) - pure, explainable rules.
 *
 * Stages run strictly in order. A stage can only advance when its gate has no
 * blockers; nothing is ever plugged, and exceptions are resolved explicitly by
 * someone other than the person who raised them. "Production" is not a stage:
 * the furthest this workflow reaches is APPROVED_FOR_PARALLEL.
 */

export const MIGRATION_STAGES = [
  "source_documents_received",
  "data_extraction",
  "mapping_review",
  "opening_balance_review",
  "exceptions",
  "ready_for_approval",
  "approved_for_parallel",
] as const;
export type MigrationStage = (typeof MIGRATION_STAGES)[number];

export const MIGRATION_STAGE_LABELS: Record<MigrationStage, string> = {
  source_documents_received: "Source documents received",
  data_extraction: "Data extraction",
  mapping_review: "Mapping review",
  opening_balance_review: "Opening balance review",
  exceptions: "Exceptions",
  ready_for_approval: "Ready for approval",
  approved_for_parallel: "Approved for parallel",
};

export const REQUIRED_SOURCE_ARTIFACTS = [
  "trial_balance",
  "general_ledger",
  "bank_statement",
  "bank_reconciliation",
  "commitment_schedule",
  "capital_account_schedule",
  "investment_schedule",
  "prior_nav",
  "management_fee_schedule",
  "capital_call_history",
  "distribution_history",
  "valuation_support",
] as const;
export type SourceArtifact = (typeof REQUIRED_SOURCE_ARTIFACTS)[number];

/* ------------------------------------------------------------------ mapping */

export type SourceAccount = { code: string; name: string; type: AccountType; balanceCents: number };
export type TargetAccount = { code: string; name: string; type: AccountType; isPlug?: boolean; authorizedBy?: string | null };
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
/** source code -> target code; null = deliberately left unmapped (an exception). */
export type AccountMapping = Record<string, string | null | undefined>;

export type MappingIssue = { sourceCode: string; kind: "unmapped" | "unknown_target" | "type_mismatch" | "plug_target" | "unauthorized_new_account"; detail: string; material: boolean };

/** Material when the absolute balance is at or above the threshold (default: any non-zero balance). */
export function validateMapping(
  source: readonly SourceAccount[],
  target: readonly TargetAccount[],
  mapping: AccountMapping,
  materialityCents = 1,
): { issues: MappingIssue[]; manyToOne: Record<string, string[]>; blocking: MappingIssue[] } {
  const byCode = new Map(target.map((t) => [t.code, t]));
  const issues: MappingIssue[] = [];
  const manyToOne: Record<string, string[]> = {};
  for (const s of source) {
    const material = Math.abs(s.balanceCents) >= materialityCents;
    const to = mapping[s.code];
    if (!to) {
      issues.push({ sourceCode: s.code, kind: "unmapped", detail: `${s.code} ${s.name} is not mapped.`, material });
      continue;
    }
    const t = byCode.get(to);
    if (!t) {
      issues.push({ sourceCode: s.code, kind: "unknown_target", detail: `${s.code} maps to ${to}, which is not in the Harmonious chart.`, material: true });
      continue;
    }
    if (t.isPlug) {
      issues.push({ sourceCode: s.code, kind: "plug_target", detail: `${s.code} maps to a suspense/plug account; plugs are never allowed.`, material: true });
      continue;
    }
    if (t.type !== s.type) {
      issues.push({ sourceCode: s.code, kind: "type_mismatch", detail: `${s.code} is ${s.type} but ${to} is ${t.type}.`, material: true });
      continue;
    }
    (manyToOne[to] ??= []).push(s.code);
  }
  for (const t of target) {
    if (t.authorizedBy === null) {
      const used = Object.values(mapping).includes(t.code);
      if (used) issues.push({ sourceCode: t.code, kind: "unauthorized_new_account", detail: `New account ${t.code} has not been authorized.`, material: true });
    }
  }
  for (const k of Object.keys(manyToOne)) if (manyToOne[k]!.length < 2) delete manyToOne[k];
  return { issues, manyToOne, blocking: issues.filter((i) => i.material) };
}

/** Balances rolled up into Harmonious accounts. Only valid when there are no blocking issues. */
export function mappedBalances(source: readonly SourceAccount[], mapping: AccountMapping): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of source) {
    const to = mapping[s.code];
    if (to) out[to] = (out[to] ?? 0) + s.balanceCents;
  }
  return out;
}

/* ---------------------------------------------------------- opening balances */

export type OpeningPackage = {
  /** Signed: debit-normal positive for assets/expenses, credit-normal positive for liabilities/equity/income. */
  accounts: readonly SourceAccount[];
  bankStatementCents: number;
  outstandingItemsCents: number; // checks/deposits in transit (bank + items = book cash)
  cashAccountCodes: readonly string[];
  investmentAccountCodes: readonly string[];
  investments: readonly { name: string; costCents: number; fairValueCents: number; valuationEvidence: boolean }[];
  investors: readonly { key: string; commitmentCents: number; capitalCents: number; sourceCapitalCents: number; sourceCommitmentCents: number; taxDocument: boolean }[];
  fundCommitmentsCents: number;
  priorNavCents: number;
};

export type OpeningCheck = { key: string; label: string; ok: boolean; expected: number; actual: number; detail?: string };

export function openingBalanceChecks(p: OpeningPackage): OpeningCheck[] {
  const sumType = (types: AccountType[]) => p.accounts.filter((a) => types.includes(a.type)).reduce((s, a) => s + a.balanceCents, 0);
  const debits = sumType(["asset", "expense"]);
  const credits = sumType(["liability", "equity", "income"]);
  const pick = (codes: readonly string[]) => p.accounts.filter((a) => codes.includes(a.code)).reduce((s, a) => s + a.balanceCents, 0);
  const cash = pick(p.cashAccountCodes);
  const invBook = pick(p.investmentAccountCodes);
  const invSchedule = p.investments.reduce((s, i) => s + i.fairValueCents, 0);
  const investorCapital = p.investors.reduce((s, i) => s + i.capitalCents, 0);
  const commitments = p.investors.reduce((s, i) => s + i.commitmentCents, 0);
  const liabilities = sumType(["liability"]);
  const navFromBooks = sumType(["asset"]) - liabilities;
  const checks: OpeningCheck[] = [
    { key: "tb_balances", label: "Debits = credits", ok: debits === credits, expected: debits, actual: credits },
    { key: "cash_reconciles", label: "Book cash = bank statement + outstanding items", ok: cash === p.bankStatementCents + p.outstandingItemsCents, expected: p.bankStatementCents + p.outstandingItemsCents, actual: cash },
    { key: "investments_reconcile", label: "Investment accounts = investment schedule", ok: invBook === invSchedule, expected: invSchedule, actual: invBook },
    { key: "investor_capital_reconciles", label: "Sum of investor capital = fund net assets", ok: investorCapital === navFromBooks, expected: navFromBooks, actual: investorCapital },
    { key: "commitments_reconcile", label: "Investor commitments = fund commitments", ok: commitments === p.fundCommitmentsCents, expected: p.fundCommitmentsCents, actual: commitments },
    { key: "nav_reconstructs", label: "Opening NAV reconstructs prior NAV", ok: navFromBooks === p.priorNavCents, expected: p.priorNavCents, actual: navFromBooks },
  ];
  for (const i of p.investors) {
    if (i.capitalCents !== i.sourceCapitalCents) checks.push({ key: `capital:${i.key}`, label: `${i.key} capital matches source`, ok: false, expected: i.sourceCapitalCents, actual: i.capitalCents });
    if (i.commitmentCents !== i.sourceCommitmentCents) checks.push({ key: `commitment:${i.key}`, label: `${i.key} commitment matches source`, ok: false, expected: i.sourceCommitmentCents, actual: i.commitmentCents });
  }
  return checks;
}

/* ---------------------------------------------------------------- exceptions */

export type MigrationException = {
  key: string;
  kind: "unmapped_account" | "capital_difference" | "bank_outstanding_item" | "missing_valuation_evidence" | "commitment_mismatch" | "missing_tax_document" | "opening_check";
  detail: string;
  /** Structural exceptions must be corrected; they can never be "accepted". */
  structural: boolean;
  raisedBy: string;
  resolution?: { by: string; outcome: "corrected" | "accepted"; note: string } | null;
};

/** Everything the migration must surface before approval. Never silently resolved. */
export function detectExceptions(p: OpeningPackage, mappingIssues: readonly MappingIssue[], raisedBy: string): MigrationException[] {
  const out: MigrationException[] = [];
  for (const m of mappingIssues) out.push({ key: `map:${m.sourceCode}`, kind: "unmapped_account", detail: m.detail, structural: m.material, raisedBy });
  for (const c of openingBalanceChecks(p)) {
    if (c.ok) continue;
    if (c.key.startsWith("capital:")) out.push({ key: c.key, kind: "capital_difference", detail: `${c.label}: differs by ${c.actual - c.expected} cents.`, structural: true, raisedBy });
    else if (c.key.startsWith("commitment:")) out.push({ key: c.key, kind: "commitment_mismatch", detail: `${c.label}: differs by ${c.actual - c.expected} cents.`, structural: true, raisedBy });
    else out.push({ key: `check:${c.key}`, kind: "opening_check", detail: `${c.label} fails (expected ${c.expected}, got ${c.actual}).`, structural: true, raisedBy });
  }
  if (p.outstandingItemsCents !== 0) out.push({ key: "bank:outstanding", kind: "bank_outstanding_item", detail: `Outstanding bank items of ${p.outstandingItemsCents} cents need to clear or be explained.`, structural: false, raisedBy });
  for (const i of p.investments) if (!i.valuationEvidence) out.push({ key: `val:${i.name}`, kind: "missing_valuation_evidence", detail: `${i.name} has no valuation evidence.`, structural: false, raisedBy });
  for (const i of p.investors) if (!i.taxDocument) out.push({ key: `tax:${i.key}`, kind: "missing_tax_document", detail: `${i.key} has no tax document on file.`, structural: false, raisedBy });
  return out;
}

export function resolutionError(e: MigrationException, input: { by: string; outcome: "corrected" | "accepted"; note: string }): string | null {
  if (e.resolution) return "This exception is already resolved.";
  if (input.by === e.raisedBy) return "An exception must be resolved by someone other than the person who raised it.";
  if (input.note.trim().length < 10) return "Explain the resolution (at least 10 characters).";
  if (input.outcome === "accepted" && e.structural) return "A structural difference cannot be accepted; correct the source data or mapping.";
  return null;
}

/* ------------------------------------------------------------------- stages */

export type MigrationState = {
  stage: MigrationStage;
  artifacts: Partial<Record<SourceArtifact, { label: string }>>;
  extracted: boolean;
  mappingBlocking: number;
  openingChecksFailing: number;
  openExceptions: number;
  approvals: readonly { userId: string }[];
  preparedBy: string;
};

/** What stops the migration leaving its current stage. Empty = may advance. */
export function stageBlockers(s: MigrationState): string[] {
  const b: string[] = [];
  switch (s.stage) {
    case "source_documents_received": {
      for (const a of REQUIRED_SOURCE_ARTIFACTS) {
        const got = s.artifacts[a];
        if (!got) b.push(`Missing source artifact: ${a.replace(/_/g, " ")}.`);
      }
      break;
    }
    case "data_extraction":
      if (!s.extracted) b.push("Source data has not been extracted.");
      break;
    case "mapping_review":
      if (s.mappingBlocking > 0) b.push(`${s.mappingBlocking} material mapping issue(s) unresolved.`);
      break;
    case "opening_balance_review":
      if (s.openingChecksFailing > 0) b.push(`${s.openingChecksFailing} opening-balance check(s) failing.`);
      break;
    case "exceptions":
      if (s.openExceptions > 0) b.push(`${s.openExceptions} migration exception(s) open.`);
      break;
    case "ready_for_approval": {
      const independent = s.approvals.filter((a) => a.userId !== s.preparedBy);
      if (independent.length < 1) b.push("An independent approver (not the preparer) must approve.");
      if (s.mappingBlocking > 0 || s.openingChecksFailing > 0 || s.openExceptions > 0) b.push("Earlier gates are no longer clean.");
      break;
    }
    case "approved_for_parallel":
      b.push("Approved for parallel is the final migration stage; production cutover is a separate decision.");
      break;
  }
  return b;
}

export function nextStage(s: MigrationState): { to: MigrationStage | null; blockers: string[] } {
  const blockers = stageBlockers(s);
  if (blockers.length) return { to: null, blockers };
  const i = MIGRATION_STAGES.indexOf(s.stage);
  return { to: MIGRATION_STAGES[i + 1] ?? null, blockers: [] };
}
