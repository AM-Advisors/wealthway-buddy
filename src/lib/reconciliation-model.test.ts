import { describe, expect, it } from "vitest";
import {
  autoApproves,
  classifyTransaction,
  closeReadiness,
  dedupeKey,
  journalShape,
  requiredApproval,
  selectPostingRule,
  type CandidateApplication,
  type PostingRule,
} from "@/lib/reconciliation-model";

const txn = (over: Partial<Parameters<typeof classifyTransaction>[0]["txn"]> = {}) => ({
  id: "t1",
  offeringId: "fund-a",
  postedOn: "2026-03-10",
  amountCents: 250_000_00,
  name: "WIRE IN SMITH",
  description: "",
  ...over,
});

const app = (over: Partial<CandidateApplication> = {}): CandidateApplication => ({
  id: "app-1",
  userId: "user-1",
  commitmentCents: 250_000_00,
  fundingStatus: "pending",
  paymentId: "pay-1",
  paymentAmountCents: 250_000_00,
  paymentStatus: "pending",
  referenceCode: "HRM-4821",
  investorName: "Smith Holdings LLC",
  ...over,
});

const base = { applications: [], invoices: [], wireRequests: [] as never[] };

const rule = (over: Partial<PostingRule> = {}): PostingRule => ({
  id: "r1",
  book_id: null,
  offering_id: null,
  transaction_type: "investor_contribution",
  direction: "inflow",
  counterparty_pattern: null,
  min_amount_cents: null,
  max_amount_cents: null,
  debit_account_code: "1000",
  credit_account_code: "3100",
  approval_required: "none",
  approval_threshold_cents: null,
  materiality_threshold_cents: 0,
  priority: 500,
  version: 1,
  is_active: true,
  ...over,
});

describe("classification engine", () => {
  it("matches an investor wire on its reference with high confidence", () => {
    const out = classifyTransaction({
      ...base,
      txn: txn({ description: "REF HRM-4821" }),
      applications: [app()],
    });
    expect(out.transactionType).toBe("investor_contribution");
    expect(out.confidence).toBe("high");
    expect(out.matched.applicationId).toBe("app-1");
    expect(out.matched.investorUserId).toBe("user-1");
  });

  it("drops to low confidence and flags a conflict when two investors owe the same amount", () => {
    const out = classifyTransaction({
      ...base,
      txn: txn({ name: "WIRE IN", description: "" }),
      applications: [app(), app({ id: "app-2", userId: "user-2", referenceCode: "HRM-9999", investorName: "Jones Trust" })],
    });
    expect(out.confidence).toBe("low");
    expect(out.conflicts.join(" ")).toMatch(/2 investors/);
  });

  it("never invents a match when nothing explains the cash", () => {
    const out = classifyTransaction({ ...base, txn: txn({ name: "ZZZ", amountCents: 12_345 }) });
    expect(out.confidence).toBe("unmatched");
    expect(out.matched.applicationId).toBeUndefined();
    expect(out.exceptions).toContain("unmatched_cash");
  });

  it("raises an amount mismatch instead of matching a near-miss", () => {
    const out = classifyTransaction({
      ...base,
      txn: txn({ amountCents: 249_900_00 }),
      applications: [app()],
    });
    expect(out.matched.applicationId).toBeUndefined();
    expect(out.exceptions).toContain("amount_mismatch");
  });

  it("does not match an already settled investor", () => {
    const out = classifyTransaction({
      ...base,
      txn: txn({ description: "REF HRM-4821" }),
      applications: [app({ paymentStatus: "settled", fundingStatus: "settled" })],
    });
    expect(out.matched.applicationId).toBeUndefined();
  });

  it("flags a suspected duplicate deposit", () => {
    const out = classifyTransaction({
      ...base,
      txn: txn({ description: "REF HRM-4821" }),
      applications: [app()],
      siblings: [{ id: "t0", postedOn: "2026-03-10", amountCents: 250_000_00, name: "WIRE IN SMITH" }],
    });
    expect(out.exceptions).toContain("suspected_duplicate");
  });

  it("classifies an outgoing management fee", () => {
    const out = classifyTransaction({
      ...base,
      txn: txn({ amountCents: -50_000_00, name: "MANAGEMENT FEE Q1" }),
    });
    expect(out.transactionType).toBe("management_fee");
  });

  it("matches an approved wire request on its purpose", () => {
    const out = classifyTransaction({
      ...base,
      txn: txn({ amountCents: -100_000_00, name: "OUTGOING WIRE", description: "acme acquisition" }),
      wireRequests: [{ id: "w1", amountCents: 100_000_00, purpose: "Acme acquisition", note: "acme acquisition", expectedDate: "2026-03-10" }],
    });
    expect(out.matched.wireRequestId).toBe("w1");
    expect(out.confidence).toBe("high");
  });

  it("flags a missing investor when only the description suggests a contribution", () => {
    const out = classifyTransaction({ ...base, txn: txn({ name: "CAPITAL CALL PAYMENT", amountCents: 7_777 }) });
    expect(out.transactionType).toBe("capital_call");
    expect(out.confidence).toBe("low");
    expect(out.exceptions).toContain("missing_investor");
  });

  it("flags a currency mismatch against the book", () => {
    const out = classifyTransaction({ ...base, txn: { ...txn(), currency: "EUR" }, bookCurrency: "USD" });
    expect(out.exceptions).toContain("inconsistent_currency");
  });

  it("flags a transaction with no fund", () => {
    const out = classifyTransaction({ ...base, txn: txn({ offeringId: null }) });
    expect(out.exceptions).toContain("missing_fund");
  });

  it("gives the same cash movement the same identity under a different provider id", () => {
    const a = dedupeKey({ offeringId: "fund-a", postedOn: "2026-03-10", amountCents: 100, name: "WIRE IN" });
    const b = dedupeKey({ offeringId: "fund-a", postedOn: "2026-03-10", amountCents: 100, name: "wire-in" });
    expect(a).toBe(b);
  });

  it("confidence alone never approves anything", () => {
    expect(autoApproves("high")).toBe(false);
  });
});

describe("posting rules", () => {
  it("prefers a fund rule over the platform default", () => {
    const chosen = selectPostingRule(
      [rule(), rule({ id: "r2", offering_id: "fund-a", credit_account_code: "3150", priority: 500 })],
      { transactionType: "investor_contribution", inflow: true, amountCents: 100, offeringId: "fund-a" },
    );
    expect(chosen?.id).toBe("r2");
  });

  it("prefers a book rule over a fund rule", () => {
    const chosen = selectPostingRule(
      [
        rule({ id: "r2", offering_id: "fund-a" }),
        rule({ id: "r3", book_id: "book-1", offering_id: "fund-a" }),
      ],
      {
        transactionType: "investor_contribution",
        inflow: true,
        amountCents: 100,
        offeringId: "fund-a",
        bookId: "book-1",
      },
    );
    expect(chosen?.id).toBe("r3");
  });

  it("never lends another fund's rule", () => {
    const chosen = selectPostingRule([rule({ id: "r2", offering_id: "fund-b" })], {
      transactionType: "investor_contribution",
      inflow: true,
      amountCents: 100,
      offeringId: "fund-a",
    });
    expect(chosen).toBeNull();
  });

  it("respects direction and amount bounds", () => {
    expect(
      selectPostingRule([rule()], { transactionType: "investor_contribution", inflow: false, amountCents: 100 }),
    ).toBeNull();
    expect(
      selectPostingRule([rule({ min_amount_cents: 1000 })], {
        transactionType: "investor_contribution",
        inflow: true,
        amountCents: 100,
      }),
    ).toBeNull();
  });

  it("ignores inactive rules", () => {
    expect(
      selectPostingRule([rule({ is_active: false })], {
        transactionType: "investor_contribution",
        inflow: true,
        amountCents: 100,
      }),
    ).toBeNull();
  });

  it("builds a balanced contribution journal: debit cash, credit capital", () => {
    const shape = journalShape(rule(), 250_000_00);
    expect(shape).toEqual({ debitCode: "1000", creditCode: "3100", amountCents: 250_000_00 });
  });

  it("builds an expense journal: debit expense, credit cash", () => {
    const shape = journalShape(
      rule({ transaction_type: "fund_expense", direction: "outflow", debit_account_code: "5200", credit_account_code: "1000" }),
      -4_000_00,
    );
    expect(shape).toEqual({ debitCode: "5200", creditCode: "1000", amountCents: 4_000_00 });
  });
});

describe("approval routing", () => {
  it("posts routine classifications on Harmonious approval alone", () => {
    expect(requiredApproval({ rule: rule(), amountCents: 100, confidence: "high" }).approver).toBe("none");
  });

  it("asks the manager for distributions", () => {
    const decision = requiredApproval({
      rule: rule({ transaction_type: "distribution", approval_required: "fund_manager", approval_threshold_cents: 0 }),
      amountCents: -10_000_00,
      confidence: "high",
    });
    expect(decision.approver).toBe("fund_manager");
  });

  it("does not ask for approval below the configured amount", () => {
    const decision = requiredApproval({
      rule: rule({ approval_required: "fund_manager", approval_threshold_cents: 2_500_000 }),
      amountCents: 1_000_00,
      confidence: "high",
    });
    expect(decision.approver).toBe("none");
  });

  it("always routes a manual correction for approval", () => {
    const decision = requiredApproval({
      rule: rule(),
      amountCents: 100,
      confidence: "high",
      manuallyCorrected: true,
    });
    expect(decision.approver).toBe("fund_manager");
  });

  it("routes a corrected client item to the client", () => {
    const decision = requiredApproval({
      rule: rule(),
      amountCents: 100,
      confidence: "high",
      manuallyCorrected: true,
      isClientItem: true,
    });
    expect(decision.approver).toBe("client");
  });

  it("escalates when no accounting mapping exists", () => {
    expect(requiredApproval({ rule: null, amountCents: 100, confidence: "low" }).approver).toBe("fund_manager");
  });
});

describe("close readiness", () => {
  const counts = {
    unreconciledCash: { count: 0, largestCents: 0 },
    openExceptions: { count: 0, materialCount: 0 },
    awaitingApproval: 0,
    unpostedJournals: 0,
  };

  it("locks only when everything is clear", () => {
    expect(closeReadiness(counts).canLock).toBe(true);
  });

  it("blocks on material unreconciled cash", () => {
    const out = closeReadiness({ ...counts, unreconciledCash: { count: 1, largestCents: 500_000 } });
    expect(out.canLock).toBe(false);
  });

  it("does not block on immaterial unreconciled cash", () => {
    const out = closeReadiness({ ...counts, unreconciledCash: { count: 1, largestCents: 500 } });
    expect(out.canLock).toBe(true);
  });

  it("blocks on unposted journals and pending approvals", () => {
    expect(closeReadiness({ ...counts, unpostedJournals: 2 }).canLock).toBe(false);
    expect(closeReadiness({ ...counts, awaitingApproval: 1 }).canLock).toBe(false);
  });

  it("honours a fund that switched a block off", () => {
    const out = closeReadiness(
      { ...counts, unpostedJournals: 2 },
      { block_on_unposted_journals: false },
    );
    expect(out.canLock).toBe(true);
  });
});
