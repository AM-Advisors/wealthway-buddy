import { describe, expect, it } from "vitest";
import { resolvePerson, personCreationBlocker, personCreationLockKey } from "@/lib/person-resolution";
import { relatedCandidateMatches } from "@/lib/related-person-model";
import { classifyBulk } from "@/lib/investor-record-model";
import { canonicalExecutionStatus } from "@/lib/document-execution-status";
import { executionState as signingState } from "@/lib/document-signing";
import { executionState as offeringState } from "@/lib/offering-document-model";
import { canonicalFundingState, isReconciledFunding, reconciledFundedCents } from "@/lib/funding-status";
import { isFunded } from "@/lib/dashboard-metrics";
import { fundStepState, managerFundingLabel } from "@/lib/fund-onboarding-model";
import { nextActionFor, reasonForItem, REASONS } from "@/lib/readiness-reasons";

const jo = { id: "p1", email: "jo@x.com", firstName: "Jo", lastName: "Doe" };
const other = { id: "p2", email: "other@x.com", firstName: "Jo", lastName: "Doe" };

describe("Person Resolution", () => {
  it("no candidates → No Match", () => expect(resolvePerson({ email: "a@b.com" }, []).outcome).toBe("no_match"));
  it("name alone is Possible, never Exact", () => {
    const r = resolvePerson({ email: "new@x.com", firstName: "Jo", lastName: "Doe" }, [{ ...jo, email: "old@x.com" }]);
    expect(r.outcome).toBe("possible_match");
    expect(r.personId).toBeNull();
  });
  it("email + name → Exact; verified email alone → Exact; unverified email alone → Possible", () => {
    expect(resolvePerson({ email: "JO@x.com ", firstName: "jo", lastName: "doe" }, [jo]).outcome).toBe("exact_match");
    expect(resolvePerson({ email: "jo@x.com", emailVerified: true }, [jo]).outcome).toBe("exact_match");
    expect(resolvePerson({ email: "jo@x.com" }, [jo]).outcome).toBe("possible_match");
  });
  it("email points to a Person with a different name → Conflict", () => {
    expect(resolvePerson({ email: "jo@x.com", firstName: "Sam", lastName: "Lee" }, [jo]).outcome).toBe("conflict");
  });
  it("two candidates → Ambiguous", () => {
    expect(resolvePerson({ firstName: "Jo", lastName: "Doe" }, [jo, other]).outcome).toBe("ambiguous");
  });
  it("different email no longer means new person without confirmation", () => {
    const r = resolvePerson({ email: "new@x.com", firstName: "Jo", lastName: "Doe" }, [jo]);
    expect(personCreationBlocker(r, false)).toMatch(/may be this person/);
    expect(personCreationBlocker(r, true)).toBeNull();
  });
  it("lock key is deterministic for concurrent creators", () => {
    expect(personCreationLockKey({ email: "Jo@X.com", firstName: "Jo", lastName: "Doe" })).toBe(personCreationLockKey({ email: "jo@x.com ", firstName: "jo", lastName: "DOE" }));
  });
  it("related persons and bulk use the same algorithm", () => {
    expect(relatedCandidateMatches({ firstName: "jo", lastName: "doe" }, jo)).toBe(true);
    const rows = classifyBulk([{ first_name: "Jo", last_name: "Doe", email: "fresh@x.com", amount: "1000", profile_type: "individual" } as any],
      [{ personId: "p1", email: "old@x.com", firstName: "Jo", lastName: "Doe", profiles: [], inFund: false }]);
    expect(rows[0]!.cls).toBe("needs_review");
  });
});

describe("Document Execution Status - all consumers agree", () => {
  const cases: [any[], string, string, string][] = [
    [[{ role: "investor", status: "signed" }, { role: "fund_signatory", status: "sent" }], "awaiting_countersignature", "partially_signed", "awaiting_countersignature"],
    [[{ role: "investor", status: "signed" }, { role: "fund_manager", status: "sent" }], "awaiting_countersignature", "partially_signed", "awaiting_countersignature"],
    [[{ role: "investor", status: "signed" }, { role: "fund_signatory", status: "signed" }], "fully_executed", "executed", "fully_executed"],
    [[{ role: "investor", status: "sent" }], "sent", "out_for_signature", "sent"],
  ];
  it.each(cases)("%j", (signers, canon, signing, offering) => {
    expect(canonicalExecutionStatus({ signers })).toBe(canon);
    expect(signingState(signers)).toBe(signing);
    expect(offeringState(signers)).toBe(offering);
  });
  it("Box completion never overrides an unsigned countersignature", () => {
    expect(canonicalExecutionStatus({ signers: [{ role: "investor", status: "signed" }, { role: "fund_signatory", status: "sent" }], providerCompleted: true })).toBe("needs_review");
  });
  it("Reference Only never blocks; acknowledgment follows acknowledgment", () => {
    expect(canonicalExecutionStatus({ usage: "reference", signers: [] })).toBe("not_required");
    expect(canonicalExecutionStatus({ usage: "acknowledgment", signers: [], acknowledged: true })).toBe("fully_executed");
  });
});

describe("Funding Status - all consumers agree", () => {
  it("settled (legacy application) and funded (Investment) are both reconciled; reports are not", () => {
    for (const s of ["funded", "settled"]) {
      expect(isReconciledFunding(s)).toBe(true);
      expect(isFunded({ fundingStatus: s, readiness: null })).toBe(true);
      expect(managerFundingLabel({ approvedToFund: true, instructionsReleased: true, fundingStatus: s, investorReportsSent: false })).toBe("Funded");
      expect(fundStepState({ onboardingComplete: true, fundingUnlocked: true, fundingStatus: s, investorReportsSent: false })).toBe("funded");
    }
    for (const s of ["investor_reports_sent", "processing", "reconciliation_pending"]) {
      expect(isReconciledFunding(s)).toBe(false);
      expect(isFunded({ fundingStatus: s, readiness: null })).toBe(false);
    }
  });
  it("canonical states", () => {
    expect(canonicalFundingState({ fundingStatus: "not_funded", approvedToFund: false })).toBe("not_ready");
    expect(canonicalFundingState({ fundingStatus: "not_funded", approvedToFund: true })).toBe("ready_for_funding");
    expect(canonicalFundingState({ fundingStatus: "not_funded", approvedToFund: true, instructionsReleased: true })).toBe("instructions_released");
    expect(canonicalFundingState({ fundingStatus: "investor_reports_sent", approvedToFund: true })).toBe("investor_reports_sent");
    expect(canonicalFundingState({ fundingStatus: "processing" })).toBe("pending_reconciliation");
    expect(canonicalFundingState({ fundingStatus: "returned" })).toBe("needs_review");
  });
  it("dashboard capital counts only reconciled money", () => {
    const rows = [{ s: "funded", c: 100 }, { s: "investor_reports_sent", c: 500 }, { s: "settled", c: 50 }];
    expect(reconciledFundedCents(rows, (r) => r.s, (r) => r.c)).toBe(150);
  });
});

describe("Next Action reasons", () => {
  const result = { items: [{ key: "funding", status: "needs_harmonious", owner: "harmonious", action: "Reconcile incoming wire" }] as any, nextAction: { label: "Reconcile incoming wire", owner: "harmonious" as const } };
  it("one condition, three presentations; only the owner gets a destination", () => {
    const inv = nextActionFor(result, "investor")!, ops = nextActionFor(result, "harmonious")!;
    expect(inv.code).toBe("FUNDING_RECONCILIATION_REQUIRED");
    expect(inv.canResolve).toBe(false);
    expect(inv.destination).toBeNull();
    expect(ops.destination).toBeTruthy();
    expect(inv.text).not.toEqual(ops.text);
  });
  it("every reason says what is needed for every audience", () => {
    for (const d of Object.values(REASONS)) for (const t of Object.values(d.wording)) expect(t.length).toBeGreaterThan(10);
    expect(reasonForItem({ key: "funding", status: "blocked" })).toBe("FUNDING_EXCEPTION");
  });
});
