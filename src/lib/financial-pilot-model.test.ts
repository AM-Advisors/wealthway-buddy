import { describe, expect, it } from "vitest";
import {
  evaluateReadiness, scoreCandidate, recommendCandidate, segregationConflicts, openingReconciliation,
  withinTolerance, varianceResolutionError, signoffError, parallelPassBlockers, pilotTransitionError, decisionTarget,
  SIGNOFF_CONFIRMATIONS, CONTROL_ROLES, type ReadinessFacts, type CandidateFactors,
} from "./financial-pilot-model";
import { payoutSentDateError, periodRefusesDate } from "./distributions-model";

const staff = Object.fromEntries([...CONTROL_ROLES, "primary_administrator", "accounting_lead", "relationship_lead"].map((r, i) => [r, `u${i}`]));
const ready: ReadinessFacts = {
  fundClassification: "LP", fiscalYearEndMonth: 12, accountingBasis: "gaap", chartOfAccounts: 20, serviceEngagement: true, staff,
  investors: 4, kycComplete: 4, kybRequired: 1, kybComplete: 1, taxDocsComplete: 4, w9: 4, w8: 0, taxReviewExceptions: 0,
  commitmentsRecorded: 4, ownershipBasisVerified: true, payoutDestinationsRequired: 0, payoutDestinationsVerified: 0,
  openingBalanceCategories: ["trial_balance_debits", "trial_balance_credits", "cash", "investments_cost", "commitments", "called_capital", "uncalled_capital", "investor_capital", "liabilities", "nav_equity"],
  openingReconciled: true, openMigrationExceptions: 0, bankAccounts: 1, bankStatementAvailable: true, reconciliationConfigured: true,
  paymentExecutionMethod: "manual", bankDataSource: "statements", investmentPositions: 2, investmentsCostLoaded: true,
  approvedWithholdingRules: 2, withholdingRulesWithAdviserSource: 2,
};

describe("pilot readiness", () => {
  it("is ready only when every prerequisite is met", () => {
    expect(evaluateReadiness(ready).level).toBe("READY_FOR_PARALLEL_PILOT");
  });
  it("records existing is not enough: missing withholding policy or KYC is NOT READY", () => {
    expect(evaluateReadiness({ ...ready, approvedWithholdingRules: 0, withholdingRulesWithAdviserSource: 0 }).level).toBe("NOT_READY");
    expect(evaluateReadiness({ ...ready, kycComplete: 3 }).level).toBe("NOT_READY");
    expect(evaluateReadiness({ ...ready, openingReconciled: false }).level).toBe("NOT_READY");
    expect(evaluateReadiness({ ...ready, investors: 0 }).level).toBe("NOT_READY");
  });
  it("non-critical gaps are READY WITH EXCEPTIONS", () => {
    expect(evaluateReadiness({ ...ready, serviceEngagement: false }).level).toBe("READY_WITH_EXCEPTIONS");
  });
  it("flags one person holding maker and checker roles", () => {
    const s = { ...staff, accounting_reviewer: staff['accounting_preparer'] };
    expect(segregationConflicts(s)).toHaveLength(1);
    expect(evaluateReadiness({ ...ready, staff: s }).level).toBe("NOT_READY");
    expect(segregationConflicts({ ...staff, finance_payout: staff['distribution_reviewer'] })).toHaveLength(1);
  });
});

const simple: CandidateFactors = { investorCount: 6, entityComplexity: 0, investmentCount: 1, monthlyTransactions: 5, bankAccountCount: 1, sideLetters: 0, waterfallTiers: 1, internationalInvestors: 0, taxComplexity: 0, historicalCompleteness: 3, dataQuality: 3, outstandingExceptions: 0, multiCurrency: false, hasFeederBlockerOrParallel: false, unusualTaxAllocation: false, nextCloseIsQuarterOrYearEnd: false };

describe("candidate scoring", () => {
  it("simple funds score low; complexity raises the score", () => {
    expect(scoreCandidate(simple).total).toBe(0);
    expect(scoreCandidate({ ...simple, investorCount: 120, investmentCount: 20 }).total).toBeGreaterThan(5);
  });
  it("disqualifies feeder, multi-currency, multi-tier waterfall and open issues", () => {
    expect(scoreCandidate({ ...simple, hasFeederBlockerOrParallel: true, multiCurrency: true, waterfallTiers: 3, outstandingExceptions: 1 }).disqualifiers).toHaveLength(4);
  });
  it("recommends the lowest suitable, never a disqualified one", () => {
    const r = recommendCandidate([{ offeringId: "a", total: 0, disqualifiers: ["x"] }, { offeringId: "b", total: 4, disqualifiers: [] }, { offeringId: "c", total: 2, disqualifiers: [] }]);
    expect(r?.offeringId).toBe("c");
    expect(recommendCandidate([{ offeringId: "a", total: 0, disqualifiers: ["x"] }])).toBeNull();
  });
});

describe("opening reconciliation and variances", () => {
  const off = { trial_balance_debits: 1000, trial_balance_credits: 1000, cash: 400, investments_cost: 600, investor_capital: 1000, commitments: 2000, called_capital: 1000, uncalled_capital: 1000 };
  const h = { tbDebits: 1000, tbCredits: 1000, cash: 400, investmentsCost: 600, investorCapital: 1000, commitments: 2000, called: 1000 };
  it("ties when everything agrees", () => expect(openingReconciliation(off, h).ties).toBe(true));
  it("any difference fails (no plug)", () => {
    expect(openingReconciliation(off, { ...h, cash: 399 }).ties).toBe(false);
    expect(openingReconciliation({ ...off, uncalled_capital: 999 }, h).ties).toBe(false);
    expect(openingReconciliation({ ...off, trial_balance_credits: 999 }, h).ties).toBe(false);
  });
  it("materiality never hides structural differences", () => {
    expect(withinTolerance("trial_balance", 1, 100000)).toBe(false);
    expect(withinTolerance("cash_vs_bank", 1, 100000)).toBe(false);
    expect(withinTolerance("expenses", 50, 100)).toBe(true);
  });
  it("variance resolution needs a second person, a cause and cannot accept structural breaks", () => {
    const v = { raised_by: "a", status: "open", classification: "unknown", structural: true };
    expect(varianceResolutionError(v, { reviewerId: "a", status: "resolved", resolution: "fixed the mapping", classification: "configuration" })).toMatch(/someone other/);
    expect(varianceResolutionError(v, { reviewerId: "b", status: "resolved", resolution: "fixed the mapping", classification: "unknown" })).toMatch(/Classify/);
    expect(varianceResolutionError(v, { reviewerId: "b", status: "accepted", resolution: "timing of a wire", classification: "timing" })).toMatch(/structural/);
    expect(varianceResolutionError({ ...v, structural: false }, { reviewerId: "b", status: "accepted", resolution: "timing of a wire", classification: "calculation_defect" })).toMatch(/Only expected/);
    expect(varianceResolutionError({ ...v, structural: false }, { reviewerId: "b", status: "accepted", resolution: "timing of a wire", classification: "timing" })).toBeNull();
  });
});

describe("sign-off and cutover", () => {
  const all = Object.fromEntries(SIGNOFF_CONFIRMATIONS.map((k) => [k, true]));
  it("needs every confirmation and four different people", () => {
    expect(signoffError([], { role: "accounting_lead", userId: "a", confirmations: { ...all, no_unexplained_plugs: false } })).toMatch(/plugs/);
    expect(signoffError([{ role_key: "accounting_lead", user_id: "a" }], { role: "leadership", userId: "a", confirmations: all })).toMatch(/different/);
    expect(parallelPassBlockers({ signoffRoles: ["accounting_lead"], openVariances: 1, openStructural: 0, closeApproved: true }).length).toBe(4);
  });
  it("cutover is a recorded decision; the state machine never skips the parallel close", () => {
    expect(decisionTarget("approve_production_cutover")).toBe("cutover_approved");
    expect(pilotTransitionError("opening_data", "parallel_passed")).not.toBeNull();
    expect(pilotTransitionError("cutover_approved", "parallel_active")).not.toBeNull();
  });
});

describe("Run 3 regression: payout economic date", () => {
  it("requires a valid, non-future sent date", () => {
    expect(payoutSentDateError(null, "2026-10-07")).toMatch(/Enter/);
    expect(payoutSentDateError("2026-13-01", "2026-10-07")).toMatch(/valid/);
    expect(payoutSentDateError("2026-10-08", "2026-10-07")).toMatch(/future/);
    expect(payoutSentDateError("2026-08-28", "2026-10-07")).toBeNull();
  });
  it("closed and locked periods refuse the date", () => {
    expect(periodRefusesDate("locked")).toBe(true);
    expect(periodRefusesDate("closed")).toBe(true);
    expect(periodRefusesDate("open")).toBe(false);
  });
});
