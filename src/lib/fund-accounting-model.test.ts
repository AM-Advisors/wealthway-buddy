import { describe, expect, it } from "vitest";
import {
  decisionError, expenseError, expenseFingerprint, expenseLines, feeTermDecisionError, postError, purchaseError,
  purchaseLines, resolveLines, settlementError, settlementLines,
} from "./fund-accounting-model";
import { computeFeeRun, type StructuredFeeTerm } from "./economic-terms";
import { FEE_TERMS, PERIOD, POSITIONS } from "./reference-fund/walkthrough-period";

const maps = [
  { purpose: "cash", accountId: "A1000" }, { purpose: "investment_cost", accountId: "A1100" },
  { purpose: "accrued_expenses", accountId: "A2100" }, { purpose: "accounts_payable", accountId: "A2000" },
  { purpose: "expense:legal", accountId: "A5110" },
];
const net = (lines: { debitCents?: number; creditCents?: number }[]) => lines.reduce((s, l) => s + (l.debitCents ?? 0) - (l.creditCents ?? 0), 0);
const buy = { kind: "purchase" as const, assetId: null, newIssuerName: "X Inc", newAssetName: "Series A", tradeDate: "2026-02-20", settlementDate: null, principalCents: 100, transactionCostCents: 5, sourceReference: "SPA" };

describe("investment purchases", () => {
  it("Dr investments / Cr cash for principal + capitalised costs, balanced", () => {
    const r = resolveLines(purchaseLines(100_00, 5_00), maps);
    expect(r.ok && r.lines).toEqual([{ accountId: "A1100", debitCents: 105_00 }, { accountId: "A1000", creditCents: 105_00 }]);
  });
  it("distinguishes new vs existing holdings", () => {
    expect(purchaseError(buy)).toBeNull();
    expect(purchaseError({ ...buy, assetId: "a" })).toMatch(/additional purchase/);
    expect(purchaseError({ ...buy, kind: "additional_purchase" })).toMatch(/existing holding/);
    expect(purchaseError({ ...buy, settlementDate: "2026-01-01" })).toMatch(/before the trade/);
  });
});

describe("expenses and payables", () => {
  it("paid hits cash, accrued hits the liability and leaves cash alone", () => {
    expect(expenseLines("legal", 45_000_00, "paid").map((l) => l.purpose)).toEqual(["expense:legal", "cash"]);
    expect(expenseLines("legal", 30_000_00, "accrued").map((l) => l.purpose)).toEqual(["expense:legal", "accrued_expenses"]);
  });
  it("settlement debits the liability, never an expense (no double expense)", () => {
    const l = settlementLines("accounts_payable", 50_000_00);
    expect(l.some((x) => x.purpose.startsWith("expense:"))).toBe(false);
    expect(net(resolveLines(l, maps).ok ? (resolveLines(l, maps) as any).lines : [])).toBe(0);
    expect(settlementError({ amountCents: 60_000_00, outstandingCents: 50_000_00 })).toMatch(/exceeds/);
  });
  it("no silent Other: unknown categories need review", () => {
    const e = { category: "misc", vendor: "V", invoiceNumber: null, expenseDate: "2026-03-01", amountCents: 1, paymentMode: "paid" as const, paidOn: "2026-03-01", sourceReference: "inv" };
    expect(expenseError(e)).toMatch(/REVIEW REQUIRED/);
    expect(expenseError({ ...e, category: "other" })).toMatch(/REVIEW REQUIRED/);
    expect(expenseError({ ...e, category: "legal", paymentMode: "accrued" })).toMatch(/accrued/);
  });
  it("duplicate fingerprint ignores case/punctuation", () => {
    expect(expenseFingerprint({ vendor: "Smith & Co.", invoiceNumber: "INV-1", expenseDate: "x", amountCents: 1 }))
      .toBe(expenseFingerprint({ vendor: "smith co", invoiceNumber: "inv-1", expenseDate: "y", amountCents: 2 }));
  });
});

describe("mappings", () => {
  it("a missing mapping blocks posting", () => {
    expect(resolveLines(expenseLines("audit_tax", 1, "paid"), maps)).toEqual({ ok: false, missing: ["expense:audit_tax"] });
  });
});

describe("segregation", () => {
  it("preparer cannot decide; approver cannot post; no double post", () => {
    expect(decisionError({ status: "prepared", preparedBy: "p" }, "p")).toMatch(/preparer/);
    expect(decisionError({ status: "prepared", preparedBy: "p" }, "r")).toBeNull();
    expect(postError({ status: "approved", decidedBy: "r" }, "r")).toMatch(/approver/);
    expect(postError({ status: "posted", decidedBy: "r" }, "x")).toMatch(/Already/);
    expect(postError({ status: "prepared", decidedBy: null }, "x")).toMatch(/approved/);
  });
  it("fee terms need a source and a second person", () => {
    const t = { approvalStatus: "pending", preparedBy: "p", createdBy: "p", sourceDocument: "LPA" };
    expect(feeTermDecisionError(t, "p", true)).toMatch(/preparer/);
    expect(feeTermDecisionError({ ...t, sourceDocument: null }, "r", true)).toMatch(/source/);
    expect(feeTermDecisionError({ ...t, approvalStatus: "approved" }, "r", true)).toMatch(/pending/);
  });
});

/**
 * Walkthrough Q1 fee validation - VERSION 2 (2026-10-08).
 * v1 ($106,062.50, walkthrough-period.test.ts) used a 1.25% Northwind rate that no
 * source record supports; it is preserved as historical evidence and marked UNSUPPORTED.
 * v2 derives the benchmark from the live contractual record: Northwind side letter 1.50%,
 * still PROPOSED. Proposed terms never apply.
 */
describe("Walkthrough Q1 fee benchmark v2", () => {
  const positions = POSITIONS.map((p) => ({ positionId: p.positionId, classId: p.classId, commitmentCents: p.commitmentCents, contributedToDateCents: p.previouslyCalledCents, beginningCapitalCents: p.openingCapitalCents }));
  const base = FEE_TERMS.filter((t) => t.id !== "sl-northwind");
  const nw = FEE_TERMS.find((t) => t.id === "sl-northwind")!;
  const sl150 = (status: string): StructuredFeeTerm => ({ ...nw, id: "sl-northwind-150", rateBps: 150, approvalStatus: status, sourceDocument: "DEMO / SYNTHETIC side letter (1.50%, proposed)" });

  it("proposed side letter is excluded: $115,437.50", () => {
    expect(computeFeeRun([...base, sl150("pending")], positions, PERIOD).totalNetCents).toBe(11_543_750);
  });
  it("if the 1.50% side letter is approved and effective: $109,187.50", () => {
    const run = computeFeeRun([...base, sl150("approved")], positions, PERIOD);
    expect(run.totalNetCents).toBe(10_918_750);
    expect(run.lines.find((l) => l.positionId === "northwind")).toMatchObject({ appliedLevel: "investor", effectiveRateBps: 150 });
  });
  it("superseded or rejected terms never apply", () => {
    expect(computeFeeRun([...base, sl150("superseded"), sl150("rejected")], positions, PERIOD).totalNetCents).toBe(11_543_750);
  });
});
