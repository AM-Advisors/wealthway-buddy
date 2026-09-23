import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { capabilitiesFor } from "@/lib/ops-capabilities";
import {
  canActOnDistribution,
  complianceGateBlockers,
  evaluateCandidate,
  financialState,
  investorPaymentLabel,
  isSettled,
  makerCheckerError,
  matchAdvancesSettlement,
  matchOutbound,
  operationsStage,
  reversalRequestError,
  snapshotDrift,
  snapshotHash,
  staffCapabilityError,
  withholdingReviewBlockers,
  type ApprovalChainEntry,
  type BankCandidate,
  type ComplianceGateFacts,
  type EconomicSnapshot,
  type ExpectedOutbound,
} from "@/lib/distributions-model";

const read = (p: string) => readFileSync(p, "utf8");
const migration = read("drizzle/migrations/0029_phase_d1_outbound_payment_controls.sql");
const server = read("src/lib/distributions.server.ts");

const chain = (...entries: [ApprovalChainEntry["step"], string][]): ApprovalChainEntry[] =>
  entries.map(([step, userId]) => ({ step, userId, at: "2026-09-01" }));
const human = (userId: string) => ({ userId, role: "harmonious" as const });

describe("D1 legacy settlement path", () => {
  it("browser cannot write fund_distributions", () => {
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.fund_distributions FROM authenticated, anon/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "distributions editable by fund team"/);
    expect(migration).toMatch(/a fund distribution can only be generated from a settled distribution payment/);
  });
  it("old settlement action cannot manufacture payment", () => {
    const legacy = read("src/lib/payment-controls.functions.ts");
    expect(legacy).not.toMatch(/from\("fund_distributions"\)\s*\.insert/);
    expect(legacy).not.toMatch(/status: "paid"/);
    expect(legacy).not.toMatch(/"settled", "returned"/);
    expect(migration).toMatch(/settlement is recorded only by bank reconciliation and posted accounting/);
  });
  it("manager/performance path cannot insert or delete distributions", () => {
    const perf = read("src/lib/performance.functions.ts");
    expect(perf).not.toMatch(/from\("fund_distributions"\)\.insert/);
    expect(perf).toMatch(/Distribution history is permanent/);
  });
  it("browser cannot read full bank/routing numbers (D0 fix preserved; views are masked)", () => {
    const d0 = read("drizzle/migrations/0028_protect_payment_instruction_secured_details.sql");
    expect(d0.toLowerCase()).toContain("secured_details");
    expect(server).toMatch(/export function maskedInstruction/);
    const ws = server.slice(server.indexOf("export async function distributionsWorkspace"));
    expect(ws.slice(0, ws.indexOf("export async function managerDistributionBoard"))).not.toMatch(/secured_details/);
  });
});

describe("D1 maker-checker", () => {
  it("requester cannot execute", () => {
    expect(makerCheckerError(chain(["requested", "a"], ["final_approved", "b"]), { step: "executed", actor: human("a") })).toMatch(/requested or prepared/);
  });
  it("preparer cannot final-approve", () => {
    expect(makerCheckerError(chain(["prepared", "a"]), { step: "final_approved", actor: human("a") })).toMatch(/cannot give the final approval/);
  });
  it("final approver cannot execute", () => {
    expect(makerCheckerError(chain(["prepared", "a"], ["final_approved", "b"]), { step: "executed", actor: human("b") })).toMatch(/final approver/);
  });
  it("a distinct executor is allowed", () => {
    expect(makerCheckerError(chain(["prepared", "a"], ["final_approved", "b"]), { step: "executed", actor: human("c") })).toBeNull();
  });
  it("executor cannot post accounting", () => {
    const c = chain(["executed", "c"], ["reconciled", "d"], ["reconciliation_approved", "e"]);
    expect(makerCheckerError(c, { step: "posted", actor: human("c") })).toMatch(/cannot post/);
    expect(makerCheckerError(c, { step: "posted", actor: human("f") })).toBeNull();
  });
  it("posting requires an approved reconciliation", () => {
    expect(makerCheckerError(chain(["executed", "c"], ["reconciled", "d"]), { step: "posted", actor: human("f") })).toMatch(/approved by a second person/);
  });
  it("reconciler cannot approve own reconciliation", () => {
    expect(makerCheckerError(chain(["reconciled", "d"]), { step: "reconciliation_approved", actor: human("d") })).toMatch(/reconciler/);
  });
  it("reversal requester cannot approve reversal", () => {
    expect(makerCheckerError(chain(["reversal_requested", "r"]), { step: "reversal_approved", actor: human("r") })).toMatch(/requested the reversal/);
  });
  it("service identity cannot satisfy second-human approval", () => {
    for (const step of ["final_approved", "executed", "reconciliation_approved", "posted", "reversal_approved"] as const) {
      expect(makerCheckerError([], { step, actor: { userId: "svc", role: "harmonious", isServicePrincipal: true } })).toMatch(/automated/);
    }
    // service entries in the chain don't count as the human final approver
    const c: ApprovalChainEntry[] = [{ step: "final_approved", userId: "svc", isServicePrincipal: true, at: "" }];
    expect(makerCheckerError(c, { step: "executed", actor: human("x") })).toMatch(/no human final approval/);
  });
  it("database enforces the same separations", () => {
    for (const msg of [
      "the requester or preparer cannot record the payment as sent",
      "the final approver cannot record the payment as sent",
      "the reconciler cannot approve their own reconciliation",
      "the person who recorded the payment cannot post it",
      "the reversal requester cannot approve the reversal",
    ]) expect(migration).toContain(msg);
  });
});

describe("D1 capability authorization", () => {
  it("broad staff visibility does not grant money actions", () => {
    const exec = capabilitiesFor(["executive"]);
    for (const a of ["prepare", "review", "final_approve", "execute", "reconcile", "post", "approve_reversal"] as const) {
      expect(staffCapabilityError(exec, a)).not.toBeNull();
    }
  });
  it("only finance/super admin may record a bank transfer", () => {
    expect(staffCapabilityError(capabilitiesFor(["admin"]), "execute")).not.toBeNull();
    expect(staffCapabilityError(capabilitiesFor(["operations"]), "execute")).not.toBeNull();
    expect(staffCapabilityError(capabilitiesFor(["finance"]), "execute")).toBeNull();
  });
  it("staff cannot act as manager or investor", () => {
    expect(staffCapabilityError(capabilitiesFor(["super_admin"]), "manager_approve")).not.toBeNull();
    expect(staffCapabilityError(capabilitiesFor(["super_admin"]), "investor_confirm")).not.toBeNull();
  });
  it("managers cannot execute, reconcile, post, reverse or override", () => {
    for (const a of ["execute", "reconcile", "post", "request_reversal", "approve_reversal", "final_approve", "resolve_exception"] as const) {
      expect(canActOnDistribution("manager", a).allowed).toBe(false);
    }
  });
  it("investors cannot change financial state", () => {
    for (const a of ["execute", "reconcile", "post", "final_approve", "correct"] as const) {
      expect(canActOnDistribution("investor", a).allowed).toBe(false);
    }
    expect(canActOnDistribution("investor", "investor_confirm").allowed).toBe(true);
  });
  it("professional delegation does not grant money authority", () => {
    // Delegated professionals have no Operations role and no managed funds, so resolve to no authority.
    expect(capabilitiesFor(["professional"])).toEqual([]);
    for (const a of ["prepare", "final_approve", "execute", "reconcile"] as const) {
      expect(canActOnDistribution("unknown", a).allowed).toBe(false);
    }
    expect(server).not.toMatch(/delegat/i);
  });
  it("manager cannot operate on another fund (role resolves from exact managed funds)", () => {
    expect(server).toMatch(/actor\.managedOfferingIds\.includes\(offeringId\)/);
  });
  it("investor cannot access another investor (lines scoped to the caller)", () => {
    expect(server).toMatch(/\.eq\("investor_user_id", actor\.userId\)/);
  });
});

const expected: ExpectedOutbound = {
  offeringId: "f1",
  sourceBankAccountId: "acct1",
  amountCents: 10_000,
  currency: "USD",
  destinationFingerprint: "fp1",
  providerReference: "REF123",
  recordedAtIso: "2026-09-10T00:00:00Z",
};
const good: BankCandidate = {
  id: "t1",
  offeringId: "f1",
  bankAccountId: "acct1",
  amountCents: -10_000,
  direction: "outbound",
  currency: "USD",
  counterpartyFingerprint: "fp1",
  reference: "Wire REF123",
  postedOn: "2026-09-11",
};

describe("D1 multi-factor reconciliation", () => {
  it("full evidence is EXACT and advances", () => {
    const r = matchOutbound(expected, "t1", [good]);
    expect(r.outcome).toBe("EXACT");
    expect(matchAdvancesSettlement(r.outcome)).toBe(true);
  });
  it("amount alone never matches", () => {
    const bare: BankCandidate = { id: "t2", offeringId: "f1", amountCents: -10_000 };
    const r = matchOutbound(expected, "t2", [bare]);
    expect(matchAdvancesSettlement(r.outcome)).toBe(false);
  });
  it("same-amount distributions do not auto-match", () => {
    const a: BankCandidate = { ...good, reference: null, counterpartyFingerprint: null, id: "a" };
    const b: BankCandidate = { ...a, id: "b" };
    const r = matchOutbound(expected, "a", [a, b]);
    expect(r.outcome).toBe("AMBIGUOUS");
  });
  it("wrong source bank account fails", () => {
    expect(evaluateCandidate(expected, { ...good, bankAccountId: "other" }).outcome).toBe("CONFLICT");
  });
  it("wrong direction fails", () => {
    expect(evaluateCandidate(expected, { ...good, direction: "inbound", amountCents: 10_000 }).outcome).toBe("CONFLICT");
  });
  it("wrong currency fails", () => {
    expect(evaluateCandidate(expected, { ...good, currency: "EUR" }).outcome).toBe("CONFLICT");
  });
  it("wrong destination fails", () => {
    expect(evaluateCandidate(expected, { ...good, counterpartyFingerprint: "fp9" }).outcome).toBe("CONFLICT");
  });
  it("conflicting provider reference fails", () => {
    expect(evaluateCandidate(expected, { ...good, reference: "OTHER999" }).outcome).toBe("CONFLICT");
  });
  it("already-matched bank transaction conflicts", () => {
    expect(evaluateCandidate(expected, { ...good, alreadyMatched: true }).outcome).toBe("CONFLICT");
  });
  it("evidence lists matched, mismatched and unavailable fields", () => {
    const e = evaluateCandidate(expected, { ...good, currency: null });
    expect(e.unavailable).toContain("currency");
    expect(e.matched).toContain("amount");
  });
});

describe("D1 settlement states", () => {
  const base = { batchStatus: "executing", reviewed: true, paymentStatus: "confirmed" };
  it("settled requires reconciliation + posted accounting", () => {
    expect(isSettled({ ...base, bankTransactionLinked: true, reconciliationApproved: false, journalPosted: false })).toBe(false);
    expect(isSettled({ ...base, bankTransactionLinked: true, reconciliationApproved: true, journalPosted: false })).toBe(false);
    expect(isSettled({ ...base, bankTransactionLinked: true, reconciliationApproved: true, journalPosted: true })).toBe(true);
    expect(migration).toContain("a payment is settled only after its journal is posted");
  });
  it("investor sees Scheduled / Sent / Completed correctly", () => {
    expect(investorPaymentLabel({ batchStatus: "approved", reviewed: true, paymentStatus: "ready", bankTransactionLinked: false, reconciliationApproved: false, journalPosted: false })).toBe("Scheduled");
    expect(investorPaymentLabel({ batchStatus: "executing", reviewed: true, paymentStatus: "submitted", bankTransactionLinked: false, reconciliationApproved: false, journalPosted: false })).toBe("Sent");
    expect(investorPaymentLabel({ ...base, bankTransactionLinked: true, reconciliationApproved: true, journalPosted: true })).toBe("Completed");
  });
  it("operations stages distinguish every step", () => {
    expect(operationsStage({ batchStatus: "harmonious_review", reviewed: false, paymentStatus: null, bankTransactionLinked: false, reconciliationApproved: false, journalPosted: false })).toBe("ready_for_review");
    expect(operationsStage({ batchStatus: "executing", reviewed: true, paymentStatus: "submitted", bankTransactionLinked: false, reconciliationApproved: false, journalPosted: false })).toBe("awaiting_bank_confirmation");
    expect(operationsStage({ ...base, bankTransactionLinked: true, reconciliationApproved: false, journalPosted: false })).toBe("reconciliation_required");
    expect(operationsStage({ ...base, bankTransactionLinked: true, reconciliationApproved: true, journalPosted: false })).toBe("accounting_required");
    expect(financialState({ ...base, paymentStatus: "returned", bankTransactionLinked: false, reconciliationApproved: false, journalPosted: false })).toBe("exception");
  });
});

describe("D1 destination immutability", () => {
  it("old destination version cannot be mutated", () => {
    expect(migration).toContain("this payment instruction version is frozen; create a new version instead");
    expect(migration).toMatch(/OLD\.verification_status = 'verified'/);
    expect(migration).toMatch(/distribution_payments p WHERE p\.payment_instruction_id = OLD\.id/);
  });
  it("destination change invalidates required approvals", () => {
    expect(server).toContain("The destination changed after approval; the approval must be renewed.");
  });
});

describe("D1 compliance gate", () => {
  const clear: ComplianceGateFacts = {
    kyc: "clear", aml: "clear", sanctions: "clear", taxDocument: "clear", taxDocumentRequired: true,
    destinationVerified: true, coolingOffSatisfied: true, openAccountingExceptions: 0,
    availableCashCents: 100, netPaymentCents: 50, batchBalances: true, withholdingReviewed: true,
  };
  it("passes only when every source is clear", () => {
    expect(complianceGateBlockers(clear)).toEqual([]);
  });
  it("missing/expired required compliance evidence blocks", () => {
    expect(complianceGateBlockers({ ...clear, kyc: "unknown" })[0]!.code).toBe("REVIEW_REQUIRED");
    expect(complianceGateBlockers({ ...clear, taxDocument: "expired" })[0]!.code).toBe("TAX_DOCUMENT_EXPIRED");
    expect(complianceGateBlockers({ ...clear, sanctions: "blocked" })[0]!.code).toBe("SANCTIONS_BLOCKED");
    expect(complianceGateBlockers({ ...clear, availableCashCents: null })[0]!.code).toBe("REVIEW_REQUIRED");
    expect(complianceGateBlockers({ ...clear, openAccountingExceptions: 1 })[0]!.code).toBe("ACCOUNTING_EXCEPTION");
    expect(complianceGateBlockers({ ...clear, withholdingReviewed: false })[0]!.code).toBe("WITHHOLDING_REVIEW");
  });
  it("withholding needs an independent review and current tax documents", () => {
    expect(withholdingReviewBlockers({ reviewedBy: "a", preparedBy: "a", lines: [] })).toHaveLength(1);
    expect(withholdingReviewBlockers({ reviewedBy: "b", preparedBy: "a", lines: [{ taxDocument: "expired", taxDocumentRequired: true }] })).toHaveLength(1);
  });
});

describe("D1 economic snapshot and reversals", () => {
  const snap: EconomicSnapshot = {
    allocationRunId: "run1", navVersionId: null, distributionType: "ordinary", calculatedAt: "2026-09-01",
    lines: [{ lineId: "l1", investorUserId: "u", investmentProfileId: "p", positionId: "pos", grossCents: 100, returnOfCapitalCents: null, incomeGainCents: null, withholdingCents: 10, feeCents: 0, netCents: 90, capitalAccountSource: null }],
  };
  it("hash is deterministic and drift is detected", () => {
    expect(snapshotHash(snap)).toBe(snapshotHash({ ...snap }));
    const later = { ...snap, lines: [{ ...snap.lines[0]!, grossCents: 120, netCents: 110 }] };
    expect(snapshotHash(later)).not.toBe(snapshotHash(snap));
    expect(snapshotDrift(snap, later).length).toBeGreaterThan(0);
    expect(migration).toContain("the frozen economic snapshot of a distribution is immutable");
  });
  it("reversal requires reason and original references", () => {
    expect(reversalRequestError({ reason: "", originalPaymentId: "p", originalJournalEntryId: "j", paymentStatus: "confirmed" })).toMatch(/reason/);
    expect(reversalRequestError({ reason: "Returned by bank", originalPaymentId: "p", originalJournalEntryId: null, paymentStatus: "confirmed", reconciled: true })).toMatch(/accounting entry/);
    expect(reversalRequestError({ reason: "Returned by bank", originalPaymentId: "p", originalJournalEntryId: "j", paymentStatus: "confirmed", reconciled: true })).toBeNull();
  });
  it("audit and payment history cannot be deleted", () => {
    expect(migration).toContain("distribution batches beyond draft are permanent");
    expect(migration).toContain("fund distribution history is permanent");
  });
  it("no provider or send-money path exists", () => {
    expect(server).toContain("Only a manually initiated bank transfer can be recorded. No payment provider is connected.");
    const ui = read("src/components/distributions-workspace.tsx");
    expect(ui).not.toMatch(/Release payment|Send money/);
  });
});
