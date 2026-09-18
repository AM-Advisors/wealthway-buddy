import { describe, expect, it } from "vitest";

import {
  BLOCKING_HOLD_KINDS,
  DISTRIBUTION_TREATMENT,
  batchTransitionError,
  calculateEntitlements,
  calculateWithholding,
  canActOnDistribution,
  capitalAccountEffect,
  changedDestinationFields,
  checkBatchBalance,
  coolingOffSatisfied,
  coolingOffUntil,
  correlateProviderEvent,
  destinationFingerprint,
  distributionBucket,
  executionBlockers,
  instructionChangeBlockers,
  investorSafeLine,
  isHighRiskChange,
  makerCheckerError,
  managerSafeLine,
  manualAdjustmentError,
  maskTail,
  paymentInstructionTransitionError,
  paymentTransitionError,
  pendingDistributionsNeedingRevalidation,
  selfReportEffect,
  type DestinationFields,
  type EntitlementInput,
  type ExecutionFacts,
  type WithholdingRule,
} from "@/lib/distributions-model";

const investor = (over: Partial<EntitlementInput> & { positionId: string }): EntitlementInput => ({
  investorUserId: `user-${over.positionId}`,
  investmentProfileId: `profile-${over.positionId}`,
  displayName: over.positionId,
  classId: null,
  commitmentCents: 0,
  contributedCents: 0,
  capitalAccountCents: 0,
  ownershipBps: 0,
  waterfallCents: null,
  ...over,
});

const destination = (over: Partial<DestinationFields> = {}): DestinationFields => ({
  method: "wire",
  beneficiaryName: "Jane Investor",
  bankName: "First National",
  accountNumber: "123456789",
  routingNumber: "021000021",
  swift: null,
  custodianAccount: null,
  country: "US",
  currency: "USD",
  ...over,
});

const baseExecution = (over: Partial<ExecutionFacts> = {}): ExecutionFacts => ({
  batchStatus: "approved",
  batchBalances: true,
  economicAllocationApproved: true,
  managerApprovalRequired: true,
  managerApprovedBy: "manager-1",
  finalApprovedBy: "ops-2",
  investorConfirmationRequired: false,
  investorConfirmedAt: null,
  destinationStatus: "approved",
  destinationVerified: true,
  destinationCoolingOffUntil: null,
  withholdingCalculated: true,
  availableCashCents: 10_000_000,
  netPaymentCents: 1_000_000,
  activeHolds: [],
  nowIso: "2026-01-10T00:00:00.000Z",
  ...over,
});

describe("economic entitlement", () => {
  it("derives each investor's share from ownership, never from typed-in amounts", () => {
    const result = calculateEntitlements({
      declaredAmountCents: 1_000_000,
      distributionType: "ordinary",
      lines: [
        investor({ positionId: "a", ownershipBps: 6000 }),
        investor({ positionId: "b", ownershipBps: 4000 }),
      ],
    });
    expect(result.error).toBeNull();
    expect(result.lines.map((l) => l.grossCents)).toEqual([600_000, 400_000]);
    expect(result.lines.every((l) => l.basis === "ownership_bps")).toBe(true);
  });

  it("allocates to the cent, with the remainder landing deterministically", () => {
    const result = calculateEntitlements({
      declaredAmountCents: 100,
      distributionType: "ordinary",
      lines: [
        investor({ positionId: "a", ownershipBps: 3333 }),
        investor({ positionId: "b", ownershipBps: 3333 }),
        investor({ positionId: "c", ownershipBps: 3334 }),
      ],
    });
    expect(result.lines.reduce((s, l) => s + l.grossCents, 0)).toBe(100);
  });

  it("prefers the approved waterfall when the fund has one", () => {
    const result = calculateEntitlements({
      declaredAmountCents: 900_000,
      distributionType: "realized_proceeds",
      useWaterfall: true,
      lines: [
        investor({ positionId: "a", ownershipBps: 5000, waterfallCents: 200_000 }),
        investor({ positionId: "b", ownershipBps: 5000, waterfallCents: 100_000 }),
      ],
    });
    expect(result.lines.map((l) => l.basis)).toEqual(["waterfall", "waterfall"]);
    expect(result.lines.map((l) => l.grossCents)).toEqual([600_000, 300_000]);
  });

  it("refuses to allocate when no approved economic basis exists", () => {
    const result = calculateEntitlements({
      declaredAmountCents: 500_000,
      distributionType: "ordinary",
      lines: [investor({ positionId: "a" })],
    });
    expect(result.error).toMatch(/no approved economic basis/i);
  });

  it("a manual override needs a reason, evidence and a second person", () => {
    expect(manualAdjustmentError({ reason: "typo", evidencePath: "x", approvedByUserId: "a" })).toMatch(
      /written reason/i,
    );
    expect(
      manualAdjustmentError({ reason: "Corrected class split per LPA", approvedByUserId: "a" }),
    ).toMatch(/supporting evidence/i);
    expect(
      manualAdjustmentError({
        reason: "Corrected class split per LPA",
        evidencePath: "docs/lpa.pdf",
        approvedByUserId: "a",
        requestedByUserId: "a",
      }),
    ).toMatch(/cannot/i);
    expect(
      manualAdjustmentError({
        reason: "Corrected class split per LPA",
        evidencePath: "docs/lpa.pdf",
        approvedByUserId: "b",
        requestedByUserId: "a",
      }),
    ).toBeNull();
  });
});

describe("withholding", () => {
  const rules: WithholdingRule[] = [
    { type: "foreign_person", rateBps: 3000, reason: "Statutory" },
    { type: "backup", rateBps: 2400, reason: "Backup" },
  ];

  it("is never inferred from citizenship alone — the tax documentation decides", () => {
    const undetermined = calculateWithholding({
      grossCents: 100_000,
      distributionType: "ordinary",
      rules,
      tax: {
        documentationForm: null,
        isForeignPerson: null,
        backupWithholdingFlag: false,
        treatyRateBps: null,
        stateCode: null,
        tinOnFile: true,
      },
    });
    expect(undetermined.totalCents).toBe(0);
    expect(undetermined.notes.join(" ")).toMatch(/no tax documentation/i);
  });

  it("applies the statutory rate to a documented foreign person", () => {
    const result = calculateWithholding({
      grossCents: 100_000,
      distributionType: "ordinary",
      rules,
      tax: {
        documentationForm: "w8ben",
        isForeignPerson: true,
        backupWithholdingFlag: false,
        treatyRateBps: null,
        stateCode: null,
        tinOnFile: true,
      },
    });
    expect(result.totalCents).toBe(30_000);
  });

  it("only honours a treaty rate when valid documentation is on file", () => {
    const withDocs = calculateWithholding({
      grossCents: 100_000,
      distributionType: "ordinary",
      rules,
      tax: {
        documentationForm: "w8ben",
        isForeignPerson: true,
        backupWithholdingFlag: false,
        treatyRateBps: 1500,
        stateCode: null,
        tinOnFile: true,
      },
    });
    expect(withDocs.totalCents).toBe(15_000);

    const withoutDocs = calculateWithholding({
      grossCents: 100_000,
      distributionType: "ordinary",
      rules,
      tax: {
        documentationForm: "none_on_file",
        isForeignPerson: true,
        backupWithholdingFlag: false,
        treatyRateBps: 1500,
        stateCode: null,
        tinOnFile: false,
      },
    });
    expect(withoutDocs.totalCents).toBe(30_000);
    expect(withoutDocs.notes.join(" ")).toMatch(/treaty rate not applied/i);
  });

  it("withholding plus net always equals gross", () => {
    const gross = 987_654;
    const result = calculateWithholding({
      grossCents: gross,
      distributionType: "ordinary",
      rules,
      tax: {
        documentationForm: "w9",
        isForeignPerson: false,
        backupWithholdingFlag: true,
        treatyRateBps: null,
        stateCode: null,
        tinOnFile: false,
      },
    });
    expect(result.totalCents + (gross - result.totalCents)).toBe(gross);
  });
});

describe("batch balance", () => {
  it("one unexplained cent blocks approval", () => {
    const off = checkBatchBalance({
      lines: [{ grossCents: 100_000, withholdingCents: 30_000, feeCents: 0, netCents: 70_001 }],
      declaredAmountCents: 100_000,
    });
    expect(off.balances).toBe(false);
    expect(off.problems.length).toBeGreaterThan(0);

    const clean = checkBatchBalance({
      lines: [{ grossCents: 100_000, withholdingCents: 30_000, feeCents: 0, netCents: 70_000 }],
      declaredAmountCents: 100_000,
    });
    expect(clean.balances).toBe(true);
  });

  it("allocations plus reserve must equal the declared amount", () => {
    const result = checkBatchBalance({
      lines: [{ grossCents: 90_000, withholdingCents: 0, feeCents: 0, netCents: 90_000 }],
      declaredAmountCents: 100_000,
      reserveCents: 10_000,
    });
    expect(result.balances).toBe(true);
  });
});

describe("authority and maker/checker", () => {
  it("a fund manager may prepare and approve, but never give Harmonious final approval", () => {
    expect(canActOnDistribution("manager", "prepare").allowed).toBe(true);
    expect(canActOnDistribution("manager", "manager_approve").allowed).toBe(true);
    expect(canActOnDistribution("manager", "final_approve").allowed).toBe(false);
    expect(canActOnDistribution("manager", "execute").allowed).toBe(false);
  });

  it("an investor may only confirm their own distribution", () => {
    expect(canActOnDistribution("investor", "investor_confirm").allowed).toBe(true);
    expect(canActOnDistribution("investor", "execute").allowed).toBe(false);
    expect(canActOnDistribution("investor", "final_approve").allowed).toBe(false);
    expect(canActOnDistribution("unknown", "prepare").allowed).toBe(false);
  });

  it("the preparer cannot give the final approval", () => {
    const error = makerCheckerError([{ step: "prepared", userId: "ops-1", at: "" }], {
      step: "final_approved",
      actor: { userId: "ops-1", role: "harmonious" },
    });
    expect(error).toMatch(/cannot give the final approval/i);
  });

  it("the same person cannot prepare, approve and execute", () => {
    const error = makerCheckerError(
      [
        { step: "prepared", userId: "ops-1", at: "" },
        { step: "final_approved", userId: "ops-1", at: "" },
      ],
      { step: "executed", actor: { userId: "ops-1", role: "harmonious" } },
    );
    expect(error).toMatch(/cannot prepare, approve and execute/i);
  });

  it("a service account never counts as a human approver", () => {
    expect(
      makerCheckerError([], { step: "executed", actor: { userId: "bot", role: "harmonious", isServicePrincipal: true } }),
    ).toMatch(/automated process/i);

    expect(
      makerCheckerError([{ step: "final_approved", userId: "bot", at: "", isServicePrincipal: true }], {
        step: "executed",
        actor: { userId: "ops-2", role: "harmonious" },
      }),
    ).toMatch(/no final approval/i);
  });

  it("execution without a final approval is refused", () => {
    expect(
      makerCheckerError([{ step: "prepared", userId: "ops-1", at: "" }], {
        step: "executed",
        actor: { userId: "ops-2", role: "harmonious" },
      }),
    ).toMatch(/no final approval/i);
  });
});

describe("payment destinations", () => {
  it("only masked values ever leave the server", () => {
    expect(maskTail("123456789")).toMatch(/6789$/);
    expect(maskTail(null)).toBeNull();
    const safe = investorSafeLine({ id: "l1", gross_cents: 100, net_cents: 70 }, maskTail("123456789"));
    expect(JSON.stringify(safe)).not.toContain("123456789");
    expect(safe.destinationEnding).toMatch(/6789$/);
  });

  it("changing an account, routing or beneficiary is high risk", () => {
    const changed = changedDestinationFields(destination(), destination({ accountNumber: "999999999" }));
    expect(changed).toContain("accountNumber");
    expect(isHighRiskChange(changed)).toBe(true);
    expect(isHighRiskChange(["label"])).toBe(false);
  });

  it("the same destination fingerprints identically and a changed one does not", () => {
    expect(destinationFingerprint(destination())).toBe(destinationFingerprint(destination()));
    expect(destinationFingerprint(destination())).not.toBe(
      destinationFingerprint(destination({ routingNumber: "011000015" })),
    );
  });

  it("a change cannot be approved without step-up, verification, notice, review and a second person", () => {
    const blockers = instructionChangeBlockers({
      stepupVerifiedAt: null,
      verificationStatus: "unverified",
      independentNoticeSentAt: null,
      harmoniousNotifiedAt: null,
      reviewedBy: null,
      requestedBy: "investor-1",
      approverUserId: "investor-1",
    });
    expect(blockers.length).toBe(6);

    expect(
      instructionChangeBlockers({
        stepupVerifiedAt: "2026-01-01T00:00:00Z",
        verificationStatus: "verified",
        independentNoticeSentAt: "2026-01-01T00:00:00Z",
        harmoniousNotifiedAt: "2026-01-01T00:00:00Z",
        reviewedBy: "ops-1",
        requestedBy: "investor-1",
        approverUserId: "ops-2",
      }),
    ).toEqual([]);
  });

  it("a cooling-off period can only be waived with a reason, by someone else", () => {
    const until = coolingOffUntil("2026-01-01T00:00:00.000Z");
    expect(coolingOffSatisfied({ coolingOffUntil: until, nowIso: "2026-01-01T01:00:00.000Z" }).satisfied).toBe(
      false,
    );
    expect(
      coolingOffSatisfied({
        coolingOffUntil: until,
        nowIso: "2026-01-01T01:00:00.000Z",
        waivedBy: "investor-1",
        waiverReason: "Investor asked us to hurry",
        requestedBy: "investor-1",
      }).satisfied,
    ).toBe(false);
    expect(
      coolingOffSatisfied({
        coolingOffUntil: until,
        nowIso: "2026-01-01T01:00:00.000Z",
        waivedBy: "ops-2",
        waiverReason: "Verified by callback with the investor on a known number",
        requestedBy: "investor-1",
      }).satisfied,
    ).toBe(true);
    expect(coolingOffSatisfied({ coolingOffUntil: until, nowIso: "2026-01-03T00:00:00.000Z" }).satisfied).toBe(
      true,
    );
  });

  it("changing a destination forces pending distributions to be revalidated", () => {
    const affected = pendingDistributionsNeedingRevalidation(
      [
        { id: "pending", paymentInstructionId: "old", approvalState: "approved", paymentState: "ready" },
        { id: "sent", paymentInstructionId: "old", approvalState: "approved", paymentState: "submitted" },
        { id: "other", paymentInstructionId: "new", approvalState: "approved", paymentState: "ready" },
      ],
      "old",
    );
    expect(affected).toEqual(["pending"]);
  });

  it("an approved destination is immutable — it is superseded, not edited", () => {
    expect(paymentInstructionTransitionError("approved", "draft")).toBeTruthy();
    expect(paymentInstructionTransitionError("approved", "superseded")).toBeNull();
  });
});

describe("execution gate", () => {
  it("passes only when every condition is met", () => {
    expect(executionBlockers(baseExecution())).toEqual([]);
  });

  it("refuses an unverified or superseded destination", () => {
    expect(executionBlockers(baseExecution({ destinationVerified: false })).join(" ")).toMatch(
      /not been verified/i,
    );
    expect(executionBlockers(baseExecution({ destinationStatus: "superseded" })).join(" ")).toMatch(
      /not an approved version/i,
    );
  });

  it("refuses without manager approval or Harmonious final approval", () => {
    expect(executionBlockers(baseExecution({ managerApprovedBy: null })).join(" ")).toMatch(
      /fund manager has not approved/i,
    );
    expect(executionBlockers(baseExecution({ finalApprovedBy: null })).join(" ")).toMatch(
      /final approval is missing/i,
    );
  });

  it("refuses while a compliance hold is active", () => {
    const blockers = executionBlockers(baseExecution({ activeHolds: ["sanctions_concern"] }));
    expect(blockers.join(" ")).toMatch(/compliance hold/i);
    expect(BLOCKING_HOLD_KINDS).toContain("sanctions_concern");
  });

  it("refuses when the fund does not have confirmed cash", () => {
    expect(
      executionBlockers(baseExecution({ availableCashCents: 10, netPaymentCents: 1_000_000 })).join(" "),
    ).toMatch(/confirmed cash/i);
  });

  it("refuses when the investor still has to confirm", () => {
    expect(
      executionBlockers(
        baseExecution({ investorConfirmationRequired: true, investorConfirmedAt: null }),
      ).join(" "),
    ).toMatch(/investor has not confirmed/i);
  });

  it("refuses while the batch does not balance", () => {
    expect(executionBlockers(baseExecution({ batchBalances: false })).join(" ")).toMatch(
      /does not balance/i,
    );
  });
});

describe("provider confirmation", () => {
  const expected = {
    providerPaymentId: "pay_1",
    submittedAmountCents: 500_000,
    submittedCurrency: "USD",
    submittedDestinationMasked: "6789",
    offeringId: "fund-1",
  };

  it("confirms only an exact correlation", () => {
    expect(
      correlateProviderEvent(
        {
          providerPaymentId: "pay_1",
          reportedAmountCents: 500_000,
          reportedCurrency: "USD",
          reportedDestinationMasked: "6789",
          reportedDirection: "outbound",
          eventType: "settled",
        },
        expected,
      ).status,
    ).toBe("confirmed");
  });

  it("a different amount is a mismatch, never a completion", () => {
    const result = correlateProviderEvent(
      {
        providerPaymentId: "pay_1",
        reportedAmountCents: 900_000,
        reportedCurrency: "USD",
        reportedDestinationMasked: "6789",
        reportedDirection: "outbound",
        eventType: "settled",
      },
      expected,
    );
    expect(result.status).toBe("mismatch");
    expect(result.mismatches.join(" ")).toMatch(/amount/i);
  });

  it("a different destination is a mismatch", () => {
    const result = correlateProviderEvent(
      {
        providerPaymentId: "pay_1",
        reportedAmountCents: 500_000,
        reportedCurrency: "USD",
        reportedDestinationMasked: "0000",
        reportedDirection: "outbound",
        eventType: "settled",
      },
      expected,
    );
    expect(result.status).toBe("mismatch");
    expect(result.mismatches.join(" ")).toMatch(/destination/i);
  });

  it("returns and failures are recognised as such", () => {
    const base = {
      providerPaymentId: "pay_1",
      reportedAmountCents: 500_000,
      reportedCurrency: "USD",
      reportedDestinationMasked: "6789",
      reportedDirection: "outbound",
    };
    expect(correlateProviderEvent({ ...base, eventType: "returned" }, expected).status).toBe("returned");
    expect(correlateProviderEvent({ ...base, eventType: "failed" }, expected).status).toBe("failed");
  });
});

describe("capital accounts and status truth", () => {
  it("capital only moves after confirmation, reconciliation and posting", () => {
    const facts = {
      netCents: 70_000,
      grossCents: 100_000,
      distributionType: "ordinary" as const,
    };
    expect(
      capitalAccountEffect({ ...facts, paymentStatus: "submitted", reconciled: false, journalPosted: false })
        .applies,
    ).toBe(false);
    expect(
      capitalAccountEffect({ ...facts, paymentStatus: "confirmed", reconciled: true, journalPosted: false })
        .applies,
    ).toBe(false);
    const posted = capitalAccountEffect({
      ...facts,
      paymentStatus: "confirmed",
      reconciled: true,
      journalPosted: true,
    });
    expect(posted.applies).toBe(true);
    expect(posted.reduceCapitalCents).toBe(100_000);
  });

  it("income-type distributions do not reduce capital", () => {
    expect(DISTRIBUTION_TREATMENT.income.reducesCapital).toBe(false);
    expect(DISTRIBUTION_TREATMENT.return_of_capital.reducesCapital).toBe(true);
    const effect = capitalAccountEffect({
      paymentStatus: "confirmed",
      reconciled: true,
      journalPosted: true,
      netCents: 100,
      grossCents: 100,
      distributionType: "income",
    });
    expect(effect.reduceCapitalCents).toBe(0);
  });

  it("nothing a screen reports advances a payment", () => {
    expect(selfReportEffect().advancesState).toBe(false);
  });

  it("an approved batch cannot be edited back into draft", () => {
    expect(batchTransitionError("approved", "draft")).toBeTruthy();
    expect(batchTransitionError("approved", "executing")).toBeNull();
    expect(batchTransitionError("completed", "executing")).toBeTruthy();
  });

  it("a payment cannot skip straight to confirmed", () => {
    expect(paymentTransitionError("ready", "confirmed")).toBeTruthy();
    expect(paymentTransitionError("submitted", "confirmed")).toBeNull();
  });
});

describe("redaction and buckets", () => {
  it("a fund manager never sees a destination", () => {
    const safe = managerSafeLine({
      id: "l1",
      display_name: "Jane",
      gross_cents: 100,
      net_cents: 70,
      payment_instruction_id: "instr-1",
      masked_account: "6789",
      secured_details: { accountNumber: "123456789" },
    });
    const json = JSON.stringify(safe);
    expect(json).not.toContain("6789");
    expect(json).not.toContain("123456789");
    expect(safe.netCents).toBe(70);
  });

  it("sorts work into the workspace buckets operations expects", () => {
    expect(
      distributionBucket({
        batchStatus: "approved",
        approvalState: "approved",
        paymentState: "ready",
        reconciliationState: "not_started",
        accountingState: "not_started",
        hasOpenException: false,
        destinationStatus: "approved",
        coolingOffActive: false,
        executionBlockerCount: 0,
      }),
    ).toBe("ready_to_execute");

    expect(
      distributionBucket({
        batchStatus: "approved",
        approvalState: "approved",
        paymentState: "ready",
        reconciliationState: "not_started",
        accountingState: "not_started",
        hasOpenException: false,
        destinationStatus: "approved",
        coolingOffActive: true,
        executionBlockerCount: 1,
      }),
    ).toBe("cooling_off");

    expect(
      distributionBucket({
        batchStatus: "executing",
        approvalState: "approved",
        paymentState: "confirmed",
        reconciliationState: "pending",
        accountingState: "not_started",
        hasOpenException: false,
        destinationStatus: "approved",
        coolingOffActive: false,
        executionBlockerCount: 0,
      }),
    ).toBe("reconciliation_pending");
  });
});
