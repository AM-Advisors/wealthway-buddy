import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { investmentAttentionStep } from "@/lib/attention-investment";
import {
  applyExemption,
  invitationRecipientError,
  isAuthoritativeSignature,
  journeySteps,
  managerInvestorStatus,
  nextJourneyStep,
  openableStep,
  verificationSummary,
} from "@/lib/investor-journey-model";
import {
  determineOnboardingRequirements,
  deriveFundingStatus,
  INVESTOR_SETTABLE_FUNDING,
  managerSafeView,
  type OfferingRequirements,
} from "@/lib/investor-onboarding-model";

const read = (p: string) => readFileSync(p, "utf8");
const server = read("src/lib/investor-onboarding.server.ts");
const NOW = "2026-09-23T00:00:00Z";

const base: OfferingRequirements = {
  accreditationRequired: false,
  kycRequired: true,
  kybRequired: true,
  amlRequired: true,
  taxDocumentRequired: false,
  subscriptionQuestionnaireRequired: false,
};
const req506b = applyExemption(base, "506b");
const req506c = applyExemption(base, "506c");

const person = { personId: "p1", kycStatus: "verified", amlStatus: "clear" };
const sub = { requestedAmountCents: 20_000_000, documentsPrepared: true, signatureStatus: "completed" };

describe("offering exemption drives requirements", () => {
  it("506(b) and 506(c) stay distinct; 506(c) needs verified accreditation", () => {
    expect(req506b.accreditationRequired).toBe(false);
    expect(req506c.accreditationRequired).toBe(true);
    expect(req506c.accreditationMethod).not.toBe("self_certification");
    const selfCert = { profileId: "x", profileType: "individual", accreditationStatus: "verified", accreditationMethod: "self_certification" };
    const r = determineOnboardingRequirements({ offering: req506c, person, profile: selfCert, subscription: sub, nowIso: NOW });
    expect(r.find((x) => x.key === "accreditation")!.state).toBe("review_required");
    const b = determineOnboardingRequirements({ offering: req506b, person, profile: selfCert, subscription: sub, nowIso: NOW });
    expect(b.find((x) => x.key === "accreditation")!.state).toBe("not_applicable");
  });
  it("exemption never relaxes a stricter configuration", () => {
    expect(applyExemption({ ...base, accreditationRequired: true }, "506b").accreditationRequired).toBe(true);
  });
  it("manager invite cannot choose the exemption", () => {
    const fns = read("src/lib/investor-onboarding.functions.ts");
    const invite = fns.slice(fns.indexOf("inviteInvestorFn"));
    expect(invite.slice(0, 600)).not.toMatch(/reg_type|exemption/i);
    expect(server).toContain("Derived from the offering's configuration");
  });
});

describe("investment-specific compliance", () => {
  it("Investment A (506b) does not satisfy Investment B (506c)", () => {
    const profile = { profileId: "x", profileType: "individual", accreditationStatus: null };
    const a = determineOnboardingRequirements({ offering: req506b, person, profile, subscription: sub, nowIso: NOW });
    const b = determineOnboardingRequirements({ offering: req506c, person, profile, subscription: sub, nowIso: NOW });
    expect(verificationSummary(a)).toBe("complete");
    expect(verificationSummary(b)).not.toBe("complete");
  });
  it("LLC verification is not replaced by individual KYC", () => {
    const llc = { profileId: "e", profileType: "llc", kybStatus: null, relatedPeople: [] };
    const r = determineOnboardingRequirements({ offering: req506b, person, profile: llc, subscription: sub, nowIso: NOW });
    expect(r.find((x) => x.key === "identity_verification")!.state).toBe("valid");
    expect(r.find((x) => x.key === "entity_verification")!.state).toBe("missing");
    expect(verificationSummary(r)).not.toBe("complete");
  });
  it("expired evidence reopens verification", () => {
    const expired = { ...person, kycExpiresAt: "2026-01-01T00:00:00Z" };
    const r = determineOnboardingRequirements({ offering: req506b, person: expired, profile: { profileId: "x", profileType: "individual" }, subscription: sub, nowIso: NOW });
    const steps = journeySteps(r, { stage: "signature", approvedToFund: false, fundingStatus: null, investorReportsSent: false });
    expect(steps.find((s) => s.key === "verify")!.state).toBe("action_required");
    expect(nextJourneyStep(steps)).toBe("verify");
  });
  it("one person, three investments, three independent progress tracks", () => {
    const fundA = determineOnboardingRequirements({ offering: req506b, person, profile: { profileId: "i", profileType: "individual" }, subscription: sub, nowIso: NOW });
    const spvB = determineOnboardingRequirements({ offering: req506c, person, profile: { profileId: "l", profileType: "llc", kybStatus: "verified", entityAmlStatus: "clear", relatedPeople: [{ role: "control_person", kycStatus: "verified" }], accreditationStatus: "verified", accreditationMethod: "third_party_letter" }, subscription: sub, nowIso: NOW });
    const fundC = determineOnboardingRequirements({ offering: req506c, person, profile: { profileId: "t", profileType: "trust", kybStatus: null, relatedPeople: [] }, subscription: { requestedAmountCents: 100 }, nowIso: NOW });
    expect(verificationSummary(fundA)).toBe("complete");
    expect(verificationSummary(spvB)).toBe("complete");
    expect(verificationSummary(fundC)).not.toBe("complete");
  });
});

describe("four-step journey and resume", () => {
  const done = determineOnboardingRequirements({ offering: req506b, person, profile: { profileId: "x", profileType: "individual" }, subscription: sub, nowIso: NOW });
  it("no profile: only About You is open", () => {
    const r = determineOnboardingRequirements({ offering: req506b, person, profile: null, subscription: {}, nowIso: NOW });
    const steps = journeySteps(r, { stage: "started", approvedToFund: false, fundingStatus: null, investorReportsSent: false });
    expect(steps.map((s) => s.state)).toEqual(["action_required", "locked", "locked", "locked"]);
    expect(openableStep(steps, "fund")).toBe("about");
  });
  it("signed, awaiting review: funding stays locked", () => {
    const steps = journeySteps(done, { stage: "harmonious_review", approvedToFund: false, fundingStatus: "not_funded", investorReportsSent: false });
    expect(steps.find((s) => s.key === "fund")!.state).toBe("locked");
  });
  it("I've Sent My Wire is informational: fund step pending, not complete", () => {
    const steps = journeySteps(done, { stage: "awaiting_funds", approvedToFund: true, fundingStatus: "investor_reports_sent", investorReportsSent: true });
    expect(steps.find((s) => s.key === "fund")!.state).toBe("in_progress");
    expect(deriveFundingStatus({ acceptedAmountCents: 100, reconciledCents: 0, investorReportsSent: true })).toBe("investor_reports_sent");
    expect(INVESTOR_SETTABLE_FUNDING.has("funded")).toBe(false);
  });
  it("complete only when funding is authoritatively funded", () => {
    const steps = journeySteps(done, { stage: "funded", approvedToFund: true, fundingStatus: "funded", investorReportsSent: true });
    expect(steps.every((s) => s.state === "complete")).toBe(true);
    expect(deriveFundingStatus({ acceptedAmountCents: 100, reconciledCents: 100 })).toBe("funded");
  });
  it("investor 'sent' path never writes cash, journals or funded", () => {
    const fn = server.slice(server.indexOf("export async function investorReportsFundsSent"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toMatch(/"funded"|journal|bank_transactions|funded_amount_cents|reconcil/);
  });
});

describe("signatures are authoritative", () => {
  const scope = { offeringDocumentIds: ["d1"], investmentProfileId: "p1", applicationId: "a1" };
  it("browser-only / incomplete signatures don't count", () => {
    expect(isAuthoritativeSignature({ application_id: "a1", offering_document_id: "d1", provider_status: "sent" }, scope)).toBe(false);
    expect(isAuthoritativeSignature({ application_id: "a1", offering_document_id: "d1", provider_completed_at: NOW, cancelled_at: NOW }, scope)).toBe(false);
    expect(isAuthoritativeSignature({ application_id: "a1", offering_document_id: "d1", provider_completed_at: NOW, superseded_by: "x" }, scope)).toBe(false);
  });
  it("another fund's or another profile's signature doesn't count", () => {
    expect(isAuthoritativeSignature({ application_id: "a1", offering_document_id: "other", provider_completed_at: NOW, provider_status: "completed" }, scope)).toBe(false);
    expect(isAuthoritativeSignature({ investment_profile_id: "p2", offering_document_id: "d1", provider_completed_at: NOW }, scope)).toBe(false);
  });
  it("provider completion for this investment counts", () => {
    expect(isAuthoritativeSignature({ application_id: "a1", offering_document_id: "d1", provider_completed_at: NOW, provider_status: "completed" }, scope)).toBe(true);
  });
  it("submitting requires provider completion evidence", () => {
    expect(server).toContain("We haven't received confirmation that signing is complete yet.");
  });
});

describe("access and privacy", () => {
  it("invitation works only for its recipient", () => {
    expect(invitationRecipientError("a@x.com", "b@x.com")).not.toBeNull();
    expect(invitationRecipientError("A@x.com", "a@x.com")).toBeNull();
    expect(server).toContain("invitationRecipientError(data.email");
  });
  it("investor cannot access another investor's onboarding", () => {
    expect(server).toMatch(/if \(row\.investor_user_id === actor\.userId\) return \{ actor, row, role: "investor" \}/);
    expect(server).toContain('forbid("this investment is not yours.")');
  });
  it("investor cannot select another person's profile", () => {
    expect(server).toContain('forbid("that investment profile is not yours.")');
  });
  it("manager view strips protected evidence", () => {
    const v = managerSafeView({ id: "1", ssn: "123", provider_payload: {}, executed_snapshot: {}, tin_last4: "1234", stage: "x" });
    expect(Object.keys(v)).toEqual(["id", "stage"]);
  });
  it("managers never receive funding instructions or mark cash received", () => {
    expect(server).toContain('forbid("fund managers do not receive investor funding instructions.")');
    const board = read("src/components/manager-add-investor.tsx");
    expect(board).not.toMatch(/applyBankActivity|funded_amount|reconcile/);
  });
  it("funding instructions are gated server-side", () => {
    const fn = server.slice(server.indexOf("export async function fundingInstructions"));
    expect(fn.slice(0, 900)).toMatch(/if \(!gate\.allowed\) return \{ unlocked: false/);
  });
});

describe("manager statuses", () => {
  it("maps authoritative state to plain statuses", () => {
    expect(managerInvestorStatus({ stage: null })).toBe("Invited");
    expect(managerInvestorStatus({ stage: "verification" })).toBe("Investor action required");
    expect(managerInvestorStatus({ stage: "harmonious_review" })).toBe("Harmonious review");
    expect(managerInvestorStatus({ stage: "approved_to_fund", approvedToFund: true })).toBe("Funding required");
    expect(managerInvestorStatus({ stage: "awaiting_funds", approvedToFund: true, investorReportsSent: true })).toBe("Funding pending");
    expect(managerInvestorStatus({ stage: "accepted", approvedToFund: true, acceptedAt: NOW })).toBe("Admitted");
    expect(managerInvestorStatus({ stage: "funded", fundingStatus: "funded" })).toBe("Funded");
  });
});

describe("Action Center deep links", () => {
  it("opens the correct investment and step", () => {
    expect(investmentAttentionStep({ id: "i", stage: "started" })!.step).toBe("about");
    expect(investmentAttentionStep({ id: "i", stage: "verification" })!.step).toBe("verify");
    expect(investmentAttentionStep({ id: "i", stage: "signature" })!.step).toBe("sign");
    expect(investmentAttentionStep({ id: "i", stage: "awaiting_funds", approved_to_fund_at: NOW })).toMatchObject({ step: "fund", waiting: false });
    expect(investmentAttentionStep({ id: "i", stage: "funded", funding_status: "funded" })).toBeNull();
    const att = read("src/lib/attention.server.ts");
    expect(att).toContain("href: `/investment/${inv.id}?step=${step.step}`");
    expect(att).toContain('.eq("investor_user_id", ctx.userId)');
  });
  it("no Onboarding sidebar module was added", () => {
    expect(read("src/lib/navigation.ts")).not.toMatch(/label: "Onboarding"/);
  });
});
