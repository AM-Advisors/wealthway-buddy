import { describe, expect, it } from "vitest";

import {
  amountError,
  canCloseInvestment,
  canInvestorFund,
  deriveFundingStatus,
  determineOnboardingRequirements,
  invitationUsableError,
  managerSafeView,
  matchBankActivity,
  progressChecklist,
  queueBucket,
  reuseState,
  signatureAttribution,
  signatureTransitionError,
  stageTransitionError,
  validateQuestionnaire,
  type OfferingRequirements,
  type Question,
  type RequirementResult,
} from "@/lib/investor-onboarding-model";

const NOW = "2026-06-01T00:00:00.000Z";

const offering: OfferingRequirements = {
  accreditationRequired: true,
  accreditationMethod: "third_party",
  kycRequired: true,
  kybRequired: true,
  amlRequired: true,
  taxDocumentRequired: true,
  subscriptionQuestionnaireRequired: false,
  minInvestmentCents: 100_000_00,
};

function req(overrides: Partial<Parameters<typeof determineOnboardingRequirements>[0]> = {}) {
  return determineOnboardingRequirements({
    offering,
    person: { personId: "p1", kycStatus: "verified", amlStatus: "verified" },
    profile: {
      profileId: "pr1",
      profileType: "individual",
      accreditationStatus: "verified",
      accreditationMethod: "third_party",
      accreditationExpiresAt: "2027-01-01T00:00:00.000Z",
      taxFormStatus: "verified",
      taxFormExpiresOn: "2027-01-01",
    },
    subscription: {
      requestedAmountCents: 250_000_00,
      questionnaireComplete: true,
      documentsPrepared: true,
      signatureStatus: "completed",
      fundingStatus: "funded",
    },
    nowIso: NOW,
    ...overrides,
  });
}

const state = (rows: RequirementResult[], key: string) => rows.find((r) => r.key === key)?.state;

describe("stage machine", () => {
  it("allows only legal moves", () => {
    expect(stageTransitionError("started", "profile_selected")).toBeNull();
    expect(stageTransitionError("started", "closed")).toContain("cannot move");
    expect(stageTransitionError("closed", "accepted")).toContain("cannot move");
    expect(stageTransitionError("started", "nonsense")).toBeTruthy();
  });
});

describe("invitations", () => {
  it("rejects expired, declined and cancelled invitations", () => {
    expect(invitationUsableError({ status: "invited", expires_at: "2026-12-01T00:00:00Z" }, NOW)).toBeNull();
    expect(invitationUsableError({ status: "invited", expires_at: "2026-01-01T00:00:00Z" }, NOW)).toContain("expired");
    expect(invitationUsableError({ status: "cancelled", expires_at: null }, NOW)).toBeTruthy();
    expect(invitationUsableError(null, NOW)).toBeTruthy();
  });
});

describe("returning-investor reuse", () => {
  it("reuses only what is currently valid", () => {
    expect(reuseState("verified", null, NOW)).toBe("valid");
    expect(reuseState("verified", "2026-01-01T00:00:00Z", NOW)).toBe("refresh_required");
    expect(reuseState("pending", null, NOW)).toBe("review_required");
    expect(reuseState(null, null, NOW)).toBe("missing");
    expect(reuseState("wizard", null, NOW)).toBe("missing");
  });

  it("marks a fully verified returning investor as complete", () => {
    const rows = req();
    expect(state(rows, "identity_verification")).toBe("valid");
    expect(state(rows, "accreditation")).toBe("valid");
    expect(state(rows, "tax_documentation")).toBe("valid");
    expect(state(rows, "entity_verification")).toBe("not_applicable");
  });

  it("refreshes expired accreditation and tax documents", () => {
    const rows = req({
      profile: {
        profileId: "pr1",
        profileType: "individual",
        accreditationStatus: "verified",
        accreditationMethod: "third_party",
        accreditationExpiresAt: "2026-01-01T00:00:00.000Z",
        taxFormStatus: "verified",
        taxFormExpiresOn: "2026-01-01",
      },
    });
    expect(state(rows, "accreditation")).toBe("refresh_required");
    expect(state(rows, "tax_documentation")).toBe("refresh_required");
  });

  it("never accepts self-selected accreditation when verification is required", () => {
    const rows = req({
      profile: {
        profileId: "pr1",
        profileType: "individual",
        accreditationStatus: "verified",
        accreditationMethod: "self_certification",
      },
    });
    expect(state(rows, "accreditation")).toBe("review_required");
  });
});

describe("entity and trust investors", () => {
  it("requires entity verification and verified owners", () => {
    const rows = req({
      profile: {
        profileId: "pr2",
        profileType: "llc",
        kybStatus: "verified",
        relatedPeople: [{ role: "control_person", personId: "p9", kycStatus: "pending" }],
      },
    });
    expect(state(rows, "entity_verification")).toBe("valid");
    expect(state(rows, "beneficial_owners")).toBe("missing");
  });

  it("flags an entity with no owners recorded at all", () => {
    const rows = req({
      profile: { profileId: "pr3", profileType: "trust", kybStatus: "verified", relatedPeople: [] },
    });
    expect(state(rows, "beneficial_owners")).toBe("missing");
  });
});

describe("eligibility", () => {
  it("blocks foreign investors where the fund is US-only", () => {
    const rows = determineOnboardingRequirements({
      offering: { ...offering, foreignInvestorsPermitted: false },
      person: { personId: "p1", kycStatus: "verified", amlStatus: "verified" },
      profile: { profileId: "pr1", profileType: "individual", isForeign: true },
      subscription: {},
      nowIso: NOW,
    });
    expect(state(rows, "eligibility")).toBe("review_required");
  });

  it("does not assume every fund is 506(c)", () => {
    const rows = determineOnboardingRequirements({
      offering: { ...offering, accreditationRequired: false },
      person: { personId: "p1", kycStatus: "verified", amlStatus: "verified" },
      profile: { profileId: "pr1", profileType: "individual" },
      subscription: {},
      nowIso: NOW,
    });
    expect(state(rows, "accreditation")).toBe("not_applicable");
  });
});

describe("investment amount", () => {
  it("enforces minimum, maximum and remaining capacity", () => {
    expect(amountError(50_000_00, offering)).toContain("minimum");
    expect(amountError(250_000_00, offering)).toBeNull();
    expect(amountError(900_000_00, { ...offering, maxInvestmentCents: 500_000_00 })).toContain("maximum");
    expect(amountError(250_000_00, { ...offering, remainingCapacityCents: 100_000_00 })).toContain("capacity");
    expect(amountError(0, offering)).toBeTruthy();
  });
});

describe("funding", () => {
  it("never treats a reported wire as funded", () => {
    expect(
      deriveFundingStatus({ acceptedAmountCents: 100, reconciledCents: 0, investorReportsSent: true }),
    ).toBe("investor_reports_sent");
    expect(deriveFundingStatus({ acceptedAmountCents: 100, reconciledCents: 100 })).toBe("funded");
    expect(deriveFundingStatus({ acceptedAmountCents: 100, reconciledCents: 60 })).toBe("partially_funded");
    expect(deriveFundingStatus({ acceptedAmountCents: 100, reconciledCents: 140 })).toBe("overfunded");
    expect(
      deriveFundingStatus({ acceptedAmountCents: 100, reconciledCents: 0, pendingBankCents: 100 }),
    ).toBe("reconciliation_pending");
  });

  it("keeps funding locked until Harmonious approves", () => {
    const rows = req();
    const locked = canInvestorFund({
      stage: "harmonious_review",
      requirements: rows,
      approvedToFundAt: null,
      openBlockingExceptions: 0,
    });
    expect(locked.allowed).toBe(false);
    const open = canInvestorFund({
      stage: "approved_to_fund",
      requirements: rows,
      approvedToFundAt: NOW,
      openBlockingExceptions: 0,
    });
    expect(open.allowed).toBe(true);
  });

  it("locks funding again while a blocking issue is open", () => {
    expect(
      canInvestorFund({
        stage: "approved_to_fund",
        requirements: req(),
        approvedToFundAt: NOW,
        openBlockingExceptions: 1,
      }).allowed,
    ).toBe(false);
  });

  it("shows funding as locked on the investor checklist before approval", () => {
    const steps = progressChecklist(req(), false);
    expect(steps.find((s) => s.key === "funding")?.locked).toBe(true);
  });
});

describe("closing gate", () => {
  const base = {
    stage: "accepted" as const,
    requirements: req(),
    approvedToFundAt: NOW,
    openBlockingExceptions: 0,
    fundingStatus: "funded" as const,
    fundingReconciled: true,
    acceptedAt: NOW,
    acceptedAmountCents: 250_000_00,
  };

  it("allows closing only when everything is in place", () => {
    expect(canCloseInvestment(base).allowed).toBe(true);
    expect(canCloseInvestment({ ...base, fundingReconciled: false }).allowed).toBe(false);
    expect(canCloseInvestment({ ...base, acceptedAt: null }).allowed).toBe(false);
    expect(canCloseInvestment({ ...base, fundingStatus: "partially_funded" }).allowed).toBe(false);
  });
});

describe("bank matching", () => {
  const candidates = [
    { onboardingId: "a", offeringId: "f1", investorUserId: "u1", investmentProfileId: "p1", expectedAmountCents: 100, reference: "AAA" },
    { onboardingId: "b", offeringId: "f1", investorUserId: "u2", investmentProfileId: "p2", expectedAmountCents: 100, reference: "BBB" },
  ];

  it("matches on the reference code", () => {
    const out = matchBankActivity(
      { offeringId: "f1", amountCents: 100, reference: "aaa", transactionId: "t1" },
      candidates,
    );
    expect(out).toMatchObject({ kind: "matched", onboardingId: "a" });
  });

  it("never guesses between two investors expecting the same amount", () => {
    const out = matchBankActivity(
      { offeringId: "f1", amountCents: 100, reference: null, transactionId: "t1" },
      candidates,
    );
    expect(out.kind).toBe("exception");
  });

  it("refuses to fund two subscriptions from one transaction", () => {
    const out = matchBankActivity(
      { offeringId: "f1", amountCents: 100, reference: "AAA", transactionId: "t1" },
      candidates,
      ["t1"],
    );
    expect(out).toMatchObject({ kind: "exception" });
  });

  it("refuses a payment into the wrong fund", () => {
    const out = matchBankActivity(
      { offeringId: "f2", amountCents: 100, reference: "AAA", transactionId: "t2" },
      candidates,
    );
    expect(out.kind).toBe("exception");
  });
});

describe("questionnaire", () => {
  const questions: Question[] = [
    { key: "employed", label: "Are you employed?", type: "yes_no", required: true },
    { key: "employer", label: "Employer", type: "text", required: true, showWhen: { key: "employed", equals: [true] } },
    { key: "certify", label: "I certify the above", type: "certification", required: true },
    { key: "source", label: "Source of funds", type: "select", options: ["salary", "sale"] },
  ];

  it("skips hidden conditional questions", () => {
    const out = validateQuestionnaire(questions, { employed: false, certify: true });
    expect(out.valid).toBe(true);
  });

  it("requires a shown conditional question", () => {
    const out = validateQuestionnaire(questions, { employed: true, certify: true });
    expect(out.errors.map((e) => e.key)).toContain("employer");
  });

  it("requires certifications to be affirmative and selects to be listed", () => {
    expect(validateQuestionnaire(questions, { employed: false, certify: false }).valid).toBe(false);
    expect(
      validateQuestionnaire(questions, { employed: false, certify: true, source: "lottery" }).valid,
    ).toBe(false);
  });
});

describe("signature", () => {
  it("attributes an entity signature with capacity", () => {
    expect(
      signatureAttribution({ signerName: "Jane Doe", capacity: "Managing Member", entityName: "Example Holdings LLC" }),
    ).toBe("Signed by Jane Doe, as Managing Member, on behalf of Example Holdings LLC");
    expect(signatureAttribution({ signerName: "Jane Doe" })).toBe("Signed by Jane Doe");
  });

  it("never moves a signature backwards", () => {
    expect(signatureTransitionError("sent", "signed")).toBeNull();
    expect(signatureTransitionError("completed", "viewed")).toContain("backwards");
  });
});

describe("operations queue", () => {
  it("routes review states to the right bucket", () => {
    const rows = req({
      person: { personId: "p1", kycStatus: "verified", amlStatus: "pending" },
    });
    expect(
      queueBucket({ stage: "verification", fundingStatus: "not_funded", requirements: rows, exceptionTypes: [] }),
    ).toBe("compliance_review");
    expect(
      queueBucket({
        stage: "harmonious_review",
        fundingStatus: "not_funded",
        requirements: req(),
        exceptionTypes: [],
      }),
    ).toBe("ready_for_approval");
    expect(
      queueBucket({ stage: "funded", fundingStatus: "funded", requirements: req(), exceptionTypes: [] }),
    ).toBe("ready_to_accept");
    expect(
      queueBucket({
        stage: "awaiting_funds",
        fundingStatus: "funding_exception",
        requirements: req(),
        exceptionTypes: [],
      }),
    ).toBe("funding_exception");
  });
});

describe("manager redaction", () => {
  it("strips compliance payloads, identifiers and executed snapshots", () => {
    const view = managerSafeView({
      id: "1",
      stage: "funded",
      decision: { provider: "secret" },
      matches: ["watchlist"],
      tax_id_last4: "1234",
      executed_snapshot: { signerName: "Jane" },
      review_notes: "internal",
    });
    expect(view).toEqual({ id: "1", stage: "funded" });
  });
});
