import { describe, expect, it } from "vitest";

import {
  callLineStatus,
  callLineSummary,
  canActOnCapitalCall,
  capitalCallTransitionError,
  closingBucket,
  computeCallLines,
  deriveLifecycleStage,
  expectedFundingStatus,
  instructionChangeInvalidatesRelease,
  instructionTransitionError,
  investorVisibleInstruction,
  isAuthoritativelyFunded,
  managerBucket,
  managerSafeFunding,
  proposeFundingMatch,
  selfReportEffect,
  type CommitmentSnapshotLine,
  type FundingCandidate,
  type IncomingCash,
} from "@/lib/capital-calls-model";

const facts = (over: Partial<Parameters<typeof deriveLifecycleStage>[0]> = {}) => ({
  invited: true,
  onboardingStarted: true,
  submittedForReview: true,
  inHarmoniousReview: false,
  subscriptionAcceptedAt: "2026-04-01T00:00:00Z",
  admittedAt: "2026-04-02T00:00:00Z",
  calledCents: 100_000_00,
  investorInitiatedAt: null,
  cashDetectedCents: 0,
  inReconciliationReview: false,
  cashConfirmedCents: 0,
  postedContributionCents: 0,
  ...over,
});

describe("lifecycle is derived, never declared", () => {
  it("stops at funding_required until something happens", () => {
    expect(deriveLifecycleStage(facts())).toBe("funding_required");
  });

  it("treats an investor saying they sent money as pending only", () => {
    expect(deriveLifecycleStage(facts({ investorInitiatedAt: "2026-04-03T00:00:00Z" }))).toBe(
      "funding_pending",
    );
  });

  it("walks detection, review, confirmation, posting and funded in order", () => {
    expect(deriveLifecycleStage(facts({ cashDetectedCents: 100_000_00 }))).toBe("cash_detected");
    expect(deriveLifecycleStage(facts({ cashDetectedCents: 100_000_00, inReconciliationReview: true }))).toBe(
      "reconciliation_review",
    );
    expect(deriveLifecycleStage(facts({ cashConfirmedCents: 100_000_00 }))).toBe("cash_confirmed");
    expect(deriveLifecycleStage(facts({ postedContributionCents: 60_000_00 }))).toBe("accounting_posted");
    expect(deriveLifecycleStage(facts({ postedContributionCents: 100_000_00 }))).toBe("funded");
  });

  it("never calls an investment funded on confirmed-but-unposted cash", () => {
    expect(
      isAuthoritativelyFunded({ calledCents: 100_000_00, postedContributionCents: 0 }),
    ).toBe(false);
    expect(
      isAuthoritativelyFunded({ calledCents: 100_000_00, postedContributionCents: 99_999_99 }),
    ).toBe(false);
    expect(
      isAuthoritativelyFunded({ calledCents: 100_000_00, postedContributionCents: 100_000_00 }),
    ).toBe(true);
  });

  it("a self report changes nothing financial", () => {
    expect(selfReportEffect()).toEqual({
      marksFunded: false,
      marksCashReceived: false,
      marksReconciled: false,
      marksPosted: false,
      recordedAs: "informational_notice",
    });
  });
});

describe("capital call computation", () => {
  const snapshot: CommitmentSnapshotLine[] = [
    {
      positionId: "pos-1",
      onboardingId: null,
      investorUserId: "inv-1",
      investmentProfileId: "profile-1",
      displayName: "Investor One",
      commitmentCents: 250_000_00,
      contributedCents: 60_000_00,
      unfundedCommitmentCents: 190_000_00,
    },
    {
      positionId: "pos-2",
      onboardingId: null,
      investorUserId: "inv-2",
      investmentProfileId: "profile-2",
      displayName: "Investor Two",
      commitmentCents: 100_000_00,
      contributedCents: 100_000_00,
      unfundedCommitmentCents: 0,
    },
  ];

  it("calls a percentage of commitment and skips fully funded investors", () => {
    const result = computeCallLines({
      basis: "percentage_of_commitment",
      callType: "whole_fund",
      percentageBps: 4000,
      snapshot,
    });
    expect(result.problems).toEqual([]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.calledCents).toBe(100_000_00);
  });

  it("never calls more than the remaining unfunded commitment", () => {
    const result = computeCallLines({
      basis: "fixed_amount",
      callType: "whole_fund",
      fixedAmountCents: 500_000_00,
      snapshot,
    });
    expect(result.lines[0]!.calledCents).toBe(190_000_00);
  });

  it("requires an investor-specific call to name its investors", () => {
    const result = computeCallLines({
      basis: "fixed_amount",
      callType: "investor_specific",
      fixedAmountCents: 10_000_00,
      snapshot,
    });
    expect(result.problems[0]).toMatch(/name the investors/i);
  });

  it("scopes an investor-specific call to the named investor only", () => {
    const result = computeCallLines({
      basis: "fixed_amount",
      callType: "investor_specific",
      fixedAmountCents: 10_000_00,
      snapshot,
      includeOnly: ["pos-1"],
    });
    expect(result.lines).toHaveLength(1);
    expect(result.totalCalledCents).toBe(10_000_00);
  });
});

describe("partial funding stays partial", () => {
  it("keeps a part-paid call outstanding", () => {
    expect(callLineStatus({ calledCents: 100_000_00, postedCents: 60_000_00 })).toBe("partially_funded");
    expect(callLineStatus({ calledCents: 100_000_00, postedCents: 100_000_00 })).toBe("satisfied");
    expect(callLineStatus({ calledCents: 100_000_00, postedCents: 0 })).toBe("outstanding");
  });

  it("reports the worked example exactly", () => {
    const summary = callLineSummary({
      commitmentCents: 250_000_00,
      previouslyContributedCents: 0,
      calledCents: 100_000_00,
      postedCents: 60_000_00,
    });
    expect(summary.amountDueCents).toBe(40_000_00);
    expect(summary.unfundedCommitmentCents).toBe(190_000_00);
    expect(summary.status).toBe("partially_funded");
  });
});

describe("maker / checker on capital calls", () => {
  it("lets a manager prepare and request but never publish", () => {
    expect(canActOnCapitalCall("manager", "prepare").allowed).toBe(true);
    expect(canActOnCapitalCall("manager", "request").allowed).toBe(true);
    expect(canActOnCapitalCall("manager", "publish").allowed).toBe(false);
    expect(canActOnCapitalCall("manager", "publish", { managerPublishAuthority: true }).allowed).toBe(true);
  });

  it("refuses investors and unknown callers entirely", () => {
    expect(canActOnCapitalCall("investor", "prepare").allowed).toBe(false);
    expect(canActOnCapitalCall("unknown", "publish").allowed).toBe(false);
  });

  it("refuses illegal status moves", () => {
    expect(capitalCallTransitionError("published", "published")).toMatch(/cannot move/);
    expect(capitalCallTransitionError("draft", "published")).toMatch(/cannot move/);
    expect(capitalCallTransitionError("in_review", "published")).toBeNull();
  });
});

describe("funding instructions are versioned and released", () => {
  it("treats any change of money-moving detail as invalidating", () => {
    const a = { bankName: "First", routingNumber: "111", accountNumber: "222" };
    expect(instructionChangeInvalidatesRelease(a, { ...a })).toBe(false);
    expect(instructionChangeInvalidatesRelease(a, { ...a, accountNumber: "999" })).toBe(true);
    expect(instructionChangeInvalidatesRelease(a, { ...a, routingNumber: "333" })).toBe(true);
  });

  it("shows investors only the current released version", () => {
    const versions = [
      { releaseStatus: "superseded", effectiveDate: "2026-01-01", id: "v1" },
      { releaseStatus: "pending_review", effectiveDate: "2026-02-01", id: "v3" },
      { releaseStatus: "released", effectiveDate: "2026-02-01", id: "v2" },
    ];
    expect(investorVisibleInstruction(versions, "2026-03-01")?.id).toBe("v2");
    expect(investorVisibleInstruction([{ releaseStatus: "superseded", id: "v1" } as any])).toBeNull();
  });

  it("refuses illegal release moves", () => {
    expect(instructionTransitionError("draft", "released")).toMatch(/cannot move/);
    expect(instructionTransitionError("pending_review", "released")).toBeNull();
    expect(instructionTransitionError("superseded", "released")).toMatch(/cannot move/);
  });
});

describe("cash matching never guesses", () => {
  const candidate = (over: Partial<FundingCandidate> = {}): FundingCandidate => ({
    expectedFundingId: "exp-1",
    offeringId: "fund-a",
    onboardingId: "ob-1",
    positionId: "pos-1",
    investorUserId: "inv-1",
    investmentProfileId: "profile-1",
    capitalCallLineId: "line-1",
    expectedAmountCents: 100_000_00,
    receivedAmountCents: 0,
    currency: "USD",
    referenceCode: "AAAA-C1-ABC123",
    ...over,
  });
  const cash = (over: Partial<IncomingCash> = {}): IncomingCash => ({
    transactionId: "txn-1",
    offeringId: "fund-a",
    amountCents: 100_000_00,
    postedOn: "2026-04-10",
    reference: "WIRE AAAA-C1-ABC123",
    currency: "USD",
    direction: "credit",
    ...over,
  });

  it("matches on a quoted reference", () => {
    const result = proposeFundingMatch(cash(), [candidate()]);
    expect(result.kind).toBe("match");
    expect(result.confidence).toBe("high");
    expect(result.exceptionKind).toBe("exact_match");
  });

  it("refuses to choose between two investors sending the same amount", () => {
    const result = proposeFundingMatch(cash({ reference: "WIRE" }), [
      candidate(),
      candidate({ expectedFundingId: "exp-2", investorUserId: "inv-2", referenceCode: "AAAA-C1-ZZZ999" }),
    ]);
    expect(result.kind).toBe("exception");
    expect(result.exceptionKind).toBe("ambiguous_match");
    expect(result.candidate).toBeNull();
  });

  it("never matches on amount alone when nothing else lines up", () => {
    const result = proposeFundingMatch(cash({ reference: "WIRE", amountCents: 12_345 }), [candidate()]);
    expect(result.kind).toBe("exception");
    expect(result.exceptionKind).toBe("incorrect_reference");
  });

  it("classifies each funding exception distinctly", () => {
    expect(
      proposeFundingMatch(cash(), [candidate()], { alreadyMatchedTransactionIds: ["txn-1"] }).exceptionKind,
    ).toBe("duplicate_payment");
    expect(proposeFundingMatch(cash({ reversalOfTransactionId: "txn-0" }), [candidate()]).exceptionKind).toBe(
      "reversed_transaction",
    );
    expect(proposeFundingMatch(cash({ direction: "debit" }), [candidate()]).exceptionKind).toBe(
      "returned_wire",
    );
    expect(proposeFundingMatch(cash({ offeringId: "fund-b" }), [candidate()]).exceptionKind).toBe(
      "wrong_fund",
    );
    expect(proposeFundingMatch(cash(), []).exceptionKind).toBe("unidentified_cash");
    expect(proposeFundingMatch(cash({ currency: "EUR" }), [candidate()]).exceptionKind).toBe(
      "currency_discrepancy",
    );
    expect(
      proposeFundingMatch(cash({ bankAccountRef: "acct-2" }), [candidate({ bankAccountRef: "acct-1" })])
        .exceptionKind,
    ).toBe("wrong_bank_account");
    expect(proposeFundingMatch(cash({ amountCents: 60_000_00 }), [candidate()]).exceptionKind).toBe(
      "partial_funding",
    );
    expect(proposeFundingMatch(cash({ amountCents: 120_000_00 }), [candidate()]).exceptionKind).toBe(
      "overfunding",
    );
    expect(
      proposeFundingMatch(cash({ amountCents: 100_000_00 - 2500 }), [candidate()], {
        feeToleranceCents: 5000,
      }).exceptionKind,
    ).toBe("fees_deducted");
  });

  it("nets earlier receipts before judging the next one", () => {
    const result = proposeFundingMatch(cash({ amountCents: 40_000_00 }), [
      candidate({ receivedAmountCents: 60_000_00 }),
    ]);
    expect(result.kind).toBe("match");
    expect(result.varianceCents).toBe(0);
  });

  it("tracks the expectation's own status", () => {
    expect(expectedFundingStatus({ expectedAmountCents: 100, receivedAmountCents: 0 })).toBe("expected");
    expect(expectedFundingStatus({ expectedAmountCents: 100, receivedAmountCents: 60 })).toBe(
      "partially_received",
    );
    expect(expectedFundingStatus({ expectedAmountCents: 100, receivedAmountCents: 100 })).toBe("received");
  });
});

describe("closing and manager boards", () => {
  const base = {
    stage: "admitted" as const,
    openExceptions: 0,
    requirementsComplete: true,
    inComplianceReview: false,
    calledCents: 100_000_00,
    confirmedCents: 0,
    postedCents: 0,
    closedAt: null,
  };

  it("groups investors by authoritative state", () => {
    expect(closingBucket(base)).toBe("accepted_not_funded");
    expect(closingBucket({ ...base, postedCents: 60_000_00 })).toBe("partially_funded");
    expect(closingBucket({ ...base, confirmedCents: 100_000_00 })).toBe("accounting_pending");
    expect(closingBucket({ ...base, postedCents: 100_000_00, confirmedCents: 100_000_00 })).toBe(
      "funded_reconciled",
    );
    expect(closingBucket({ ...base, openExceptions: 1 })).toBe("cash_exception");
    expect(closingBucket({ ...base, requirementsComplete: false })).toBe("onboarding_incomplete");
    expect(closingBucket({ ...base, requirementsComplete: false, inComplianceReview: true })).toBe(
      "compliance_review",
    );
  });

  it("only calls a manager view funded when accounting is posted", () => {
    expect(managerBucket({ stage: "cash_confirmed", openManagerExceptions: 0, calledCents: 100, postedCents: 0 })).toBe(
      "funding_pending",
    );
    expect(
      managerBucket({ stage: "funded", openManagerExceptions: 0, calledCents: 100, postedCents: 100 }),
    ).toBe("funded");
    expect(
      managerBucket({ stage: "funded", openManagerExceptions: 1, calledCents: 100, postedCents: 100 }),
    ).toBe("needs_information");
  });

  it("strips cash plumbing and evidence from a manager view", () => {
    const safe = managerSafeFunding({
      onboardingId: "ob-1",
      bankTransaction: { id: "txn" },
      referenceCode: "AAAA-C1",
      nested: { kyc: { doc: "passport" }, stage: "funded" },
    });
    expect(safe.bankTransaction).toBeUndefined();
    expect(safe.referenceCode).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain("passport");
    expect(safe.nested.stage).toBe("funded");
  });
});
