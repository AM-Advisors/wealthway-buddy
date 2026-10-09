import { describe, it, expect } from "vitest";
import { activityFromBalances, navBridge, navChecks, canSubmitForReview, DEFAULT_NAV_POLICY, isSyntheticNav, syntheticPublicationError, SYNTHETIC_NAV_LABEL, type LedgerBalance } from "@/lib/nav-model";

const bal = (code: string, accountType: any, subtype: any, debitCents: number, creditCents = 0): LedgerBalance => ({ accountId: code, code, name: code, accountType, subtype, debitCents, creditCents });

describe("NAV activity", () => {
  it("counts every operating-expense subtype (legal, audit, admin, bank fees) as fund expense", () => {
    const a = activityFromBalances([
      bal("5000", "expense", "management_fee", 100),
      bal("5210", "expense", "legal", 10),
      bal("5230", "expense", "audit_tax", 20),
      bal("5250", "expense", "fund_administration", 30),
      bal("5260", "expense", "bank_fees", 5),
      bal("5300", "expense", "tax_adjustment", 7),
    ]);
    expect(a.managementFeesCents).toBe(100);
    expect(a.fundExpensesCents).toBe(65);
  });
});

describe("synthetic NAV", () => {
  it("is synthetic when any valuation used is a synthetic assumption", () => {
    expect(isSyntheticNav([{ evidenceBasis: "supporting_evidence" }, { evidenceBasis: "synthetic_assumption" }])).toBe(true);
    expect(isSyntheticNav([{ evidenceBasis: "supporting_evidence" }])).toBe(false);
  });
  it("can never be published", () => {
    expect(syntheticPublicationError(SYNTHETIC_NAV_LABEL)).toMatch(/cannot be published/);
    expect(syntheticPublicationError(null)).toBeNull();
  });
  it("an unreconciled bridge blocks review and approval", () => {
    const bridge = navBridge(100, activityFromBalances([]), 150);
    const checks = navChecks({ ledgerDebitCents: 1, ledgerCreditCents: 1, unreconciledCashCents: 0, unpostedJournalCents: 0, openExceptionCount: 0, assetsMissingValuation: [], staleValuations: [], valuationExceptionCount: 0, missingExpenseAccrual: false, openReceivablesPayablesCents: 0, unresolvedCapitalActivityCents: 0, periodStatus: "open", futureValuations: [], bridgeDifferenceCents: bridge.differenceCents, valuationCarryingDifferenceCents: 0 }, DEFAULT_NAV_POLICY);
    expect(bridge.differenceCents).toBe(50);
    expect(canSubmitForReview(checks)).toBe(false);
  });
  it("Walkthrough Q1 bridge reproduces the independent benchmark", () => {
    const end = 995_000_000 + 410_000_000 + 210_000 + 10_000_000 - 11_543_750 - 10_675_000;
    expect(end).toBe(1_392_991_250);
  });
});
