import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  canAdvanceReconciliation,
  canTransitionJournal,
  canTransitionPeriod,
  canTransitionReport,
  DEFAULT_FUND_CHART,
  domainForReport,
  endingCapitalCents,
  isBalanced,
  isReportType,
  k1Ready,
  missingProvenance,
  reopenRequiresReason,
} from "@/lib/accounting-model";

describe("chart of accounts", () => {
  it("covers every accounting concept the fund model needs", () => {
    const subtypes = new Set(DEFAULT_FUND_CHART.map((a) => a.subtype));
    for (const required of [
      "cash",
      "investments",
      "receivable",
      "payable",
      "accrued_expense",
      "management_fee",
      "organizational_expense",
      "realized_gain",
      "unrealized_gain",
      "investment_income",
      "interest",
      "dividend",
      "contribution",
      "distribution",
      "carried_interest",
      "partner_capital",
      "withholding",
      "tax_adjustment",
    ]) {
      expect(subtypes.has(required as any)).toBe(true);
    }
  });

  it("uses unique account codes", () => {
    const codes = DEFAULT_FUND_CHART.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("double entry", () => {
  it("accepts a balanced entry", () => {
    expect(
      isBalanced([
        { accountId: "a", debitCents: 10_000 },
        { accountId: "b", creditCents: 10_000 },
      ]),
    ).toBe(true);
  });

  it("rejects an unbalanced entry", () => {
    expect(() =>
      assertBalanced([
        { accountId: "a", debitCents: 10_000 },
        { accountId: "b", creditCents: 9_000 },
      ]),
    ).toThrow(/does not balance/);
  });

  it("rejects a line that is both a debit and a credit", () => {
    expect(() =>
      assertBalanced([
        { accountId: "a", debitCents: 10_000, creditCents: 10_000 },
        { accountId: "b", creditCents: 10_000 },
      ]),
    ).toThrow(/either a debit or a credit/);
  });

  it("rejects negative amounts", () => {
    expect(() =>
      assertBalanced([
        { accountId: "a", debitCents: -10_000 },
        { accountId: "b", creditCents: -10_000 },
      ]),
    ).toThrow(/negative/);
  });

  it("rejects a single-sided entry", () => {
    expect(isBalanced([{ accountId: "a", debitCents: 10_000 }])).toBe(false);
  });
});

describe("period close", () => {
  it("walks open to locked in order", () => {
    expect(canTransitionPeriod("open", "soft_closed")).toBe(true);
    expect(canTransitionPeriod("soft_closed", "review")).toBe(true);
    expect(canTransitionPeriod("review", "closed")).toBe(true);
    expect(canTransitionPeriod("closed", "locked")).toBe(true);
  });

  it("refuses to skip states", () => {
    expect(canTransitionPeriod("open", "closed")).toBe(false);
    expect(canTransitionPeriod("open", "locked")).toBe(false);
    expect(canTransitionPeriod("review", "locked")).toBe(false);
  });

  it("requires a reason to reopen a sealed period", () => {
    expect(reopenRequiresReason("closed", "open")).toBe(true);
    expect(reopenRequiresReason("locked", "open")).toBe(true);
    expect(reopenRequiresReason("review", "soft_closed")).toBe(false);
  });
});

describe("journal lifecycle", () => {
  it("follows draft to posted", () => {
    expect(canTransitionJournal("draft", "reviewed")).toBe(true);
    expect(canTransitionJournal("reviewed", "approved")).toBe(true);
    expect(canTransitionJournal("approved", "posted")).toBe(true);
  });

  it("never lets a posted entry go backwards", () => {
    expect(canTransitionJournal("posted", "draft")).toBe(false);
    expect(canTransitionJournal("posted", "approved")).toBe(false);
    expect(canTransitionJournal("reversed", "posted")).toBe(false);
  });

  it("only allows reversal out of posted", () => {
    expect(canTransitionJournal("posted", "reversed")).toBe(true);
    expect(canTransitionJournal("draft", "posted")).toBe(false);
  });
});

describe("reconciliation flow", () => {
  it("moves ingested through to posted in order", () => {
    expect(canAdvanceReconciliation("ingested", "auto_matched")).toBe(true);
    expect(canAdvanceReconciliation("auto_matched", "harmonious_reviewed")).toBe(true);
    expect(canAdvanceReconciliation("harmonious_reviewed", "acknowledged")).toBe(true);
    expect(canAdvanceReconciliation("acknowledged", "reconciled")).toBe(true);
    expect(canAdvanceReconciliation("reconciled", "posted")).toBe(true);
  });

  it("allows skipping acknowledgement when no acknowledgement is required", () => {
    expect(canAdvanceReconciliation("harmonious_reviewed", "reconciled")).toBe(true);
  });

  it("cannot post straight from ingestion, or reject something already posted", () => {
    expect(canAdvanceReconciliation("ingested", "posted")).toBe(false);
    expect(canAdvanceReconciliation("posted", "rejected")).toBe(false);
  });
});

describe("report registry", () => {
  it("keeps cap table reporting in its own domain", () => {
    expect(domainForReport("cap_table_fully_diluted")).toBe("cap_table");
    expect(domainForReport("stakeholder_statement")).toBe("cap_table");
    expect(domainForReport("capital_account_statement")).toBe("fund_accounting");
    expect(domainForReport("balance_sheet")).toBe("fund_accounting");
  });

  it("rejects unknown report types", () => {
    expect(isReportType("balance_sheet")).toBe(true);
    expect(isReportType("made_up_report")).toBe(false);
  });

  it("never reopens a published report", () => {
    expect(canTransitionReport("published", "draft")).toBe(false);
    expect(canTransitionReport("published", "approved")).toBe(false);
    expect(canTransitionReport("published", "superseded")).toBe(true);
    expect(canTransitionReport("superseded", "published")).toBe(false);
  });

  it("names the provenance a published report is missing", () => {
    const missing = missingProvenance({
      report_type: "balance_sheet",
      book_id: "b1",
      period_end: "2026-03-31",
      version: 1,
      source_cutoff_at: "2026-04-02T00:00:00Z",
      methodology_version: "v1",
      generated_by: "u1",
      generated_at: "2026-04-02T00:00:00Z",
      accounting_snapshot: {},
    });
    expect(missing).toEqual(["approved_by", "published_by", "published_at"]);
  });
});

describe("capital accounts", () => {
  it("rolls beginning capital forward through the period", () => {
    expect(
      endingCapitalCents({
        beginningCapitalCents: 1_000_000,
        contributionsCents: 500_000,
        allocatedIncomeCents: 120_000,
        allocatedLossCents: 20_000,
        distributionsCents: 300_000,
        otherAdjustmentsCents: -5_000,
      }),
    ).toBe(1_295_000);
  });
});

describe("tax", () => {
  it("will not draft a K-1 before the books are closed", () => {
    expect(k1Ready({ status: "review" }, { allocations_status: "approved" })).toBe(false);
    expect(k1Ready({ status: "closed" }, { allocations_status: "in_progress" })).toBe(false);
    expect(k1Ready({ status: "closed" }, { allocations_status: "approved" })).toBe(true);
    expect(k1Ready({ status: "locked" }, { allocations_status: "complete" })).toBe(true);
  });
});
