import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { determineOnboardingRequirements, type OfferingRequirements } from "./investor-onboarding-model";
import { computeReadiness, readinessView, readinessTransitions, readinessTaskPlan, type ReadinessInput } from "./investment-readiness";

const NOW = "2026-09-28T00:00:00Z";
const offering = (o: Partial<OfferingRequirements> = {}): OfferingRequirements => ({ accreditationRequired: false, kycRequired: true, kybRequired: true, amlRequired: true, taxDocumentRequired: true, subscriptionQuestionnaireRequired: false, ...o });
const reqs = (p: { kyc?: string; aml?: string; tax?: string; sig?: boolean; profileType?: string; kyb?: string; acc?: string; off?: Partial<OfferingRequirements> } = {}) =>
  determineOnboardingRequirements({
    offering: offering(p.off),
    person: { personId: "p1", kycStatus: p.kyc ?? "verified", amlStatus: p.aml ?? "clear" },
    profile: { profileId: "pr1", profileType: p.profileType ?? "individual", kybStatus: p.kyb ?? null, entityAmlStatus: "clear", relatedPeople: p.profileType === "llc" ? [{ role: "control_person", kycStatus: "verified" }, { role: "beneficial_owner", kycStatus: "verified" }, { role: "authorized_signer", kycStatus: "verified" }] : [], taxFormStatus: p.tax ?? "complete", accreditationStatus: p.acc ?? null },
    subscription: { requestedAmountCents: 10_000_000, documentsPrepared: true, signatureStatus: p.sig === false ? null : "completed" },
    nowIso: NOW,
  });
const input = (o: Partial<ReadinessInput> = {}, r = reqs()): ReadinessInput => ({ requirements: r, stage: "harmonious_review", fundingStatus: "not_funded", approvedToFundAt: null, acceptedAt: null, acceptedAmountCents: null, closedAt: null, exceptions: [], ...o });
const item = (res: any, k: string) => res.items.find((i: any) => i.key === k);

describe("investment readiness engine", () => {
  it("has the eight canonical stages", () => {
    expect(computeReadiness(input()).stages.map((s) => s.title)).toEqual(["Investment Profile", "Identity / Entity Verification", "Eligibility & Accreditation", "Tax", "Subscription Documents", "Funding", "Close Readiness", "Closed"]);
  });
  it("KYC completion advances identity automatically", () => {
    expect(item(computeReadiness(input({}, reqs({ kyc: "not_started" }))), "identity_verification").status).toBe("needs_investor");
    expect(item(computeReadiness(input({}, reqs({ kyc: "verified" }))), "identity_verification").status).toBe("complete");
  });
  it("KYB applies to entity profiles only", () => {
    expect(item(computeReadiness(input({}, reqs())), "entity_verification").status).toBe("not_applicable");
    expect(item(computeReadiness(input({}, reqs({ profileType: "llc", kyb: "pending" }))), "entity_verification").status).toBe("under_review");
  });
  it("accreditation only applies where the offering requires it", () => {
    expect(item(computeReadiness(input()), "accreditation").status).toBe("not_applicable");
    expect(item(computeReadiness(input({}, reqs({ off: { accreditationRequired: true } }))), "accreditation").status).toBe("needs_investor");
  });
  it("Box signature completion advances signature", () => {
    expect(item(computeReadiness(input({}, reqs({ sig: false }))), "signature").status).toBe("needs_investor");
    expect(item(computeReadiness(input()), "signature").status).toBe("complete");
  });
  it("investor 'sent wire' never completes funding; reconciliation does", () => {
    const sent = computeReadiness(input({ approvedToFundAt: NOW, fundingStatus: "investor_reports_sent" }));
    expect(item(sent, "funding").status).toBe("needs_harmonious");
    expect(sent.nextAction).toEqual({ label: "Reconcile incoming wire", owner: "harmonious" });
    expect(item(computeReadiness(input({ approvedToFundAt: NOW, fundingStatus: "funded" })), "funding").status).toBe("complete");
  });
  it("Not Applicable items do not reduce completion", () => {
    const r = computeReadiness(input());
    expect(r.requiredCount).toBe(r.items.filter((i) => i.required).length);
    expect(r.items.filter((i) => i.status === "not_applicable").every((i) => !i.required)).toBe(true);
  });
  it("any incomplete blocking item blocks Close Ready even at high completion", () => {
    const r = computeReadiness(input({ approvedToFundAt: NOW, fundingStatus: "funded" }));
    expect(r.closeReady).toBe(false);
    expect(r.closeBlockers).toContain("Subscription accepted");
    const ok = computeReadiness(input({ approvedToFundAt: NOW, fundingStatus: "funded", acceptedAt: NOW, acceptedAmountCents: 10_000_000 }));
    expect(ok.closeReady).toBe(true);
    expect(ok.percentComplete).toBe(100);
    expect(ok.nextAction).toEqual({ label: "Ready to close", owner: null });
  });
  it("funding approval depends on earlier stages (server-side dependency)", () => {
    const r = computeReadiness(input({}, reqs({ kyc: "not_started" })));
    expect(item(r, "approved_to_fund").status).toBe("not_started");
    expect(r.nextAction?.owner).toBe("investor");
  });
  it("a Harmonious/compliance blocker is not the fund manager's to clear", () => {
    const r = computeReadiness(input({ approvedToFundAt: NOW, fundingStatus: "funded", acceptedAt: NOW, acceptedAmountCents: 1, exceptions: [{ severity: "blocking", owner: "harmonious" }] }));
    expect(r.closeReady).toBe(false);
    expect(item(r, "exceptions").owner).toBe("harmonious");
  });
  it("close amount mismatch belongs to the fund manager", () => {
    const r = computeReadiness(input({ approvedToFundAt: NOW, fundingStatus: "funded", acceptedAt: NOW, acceptedAmountCents: 100, closeAmountCents: 200 }));
    expect(item(r, "close_amount").owner).toBe("fund_manager");
    expect(r.closeReady).toBe(false);
  });
  it("fund-manager view shows safe labels only, no reasons or sources", () => {
    const v: any = readinessView(computeReadiness(input({}, reqs({ tax: "missing" }))), "manager");
    expect(JSON.stringify(v)).not.toMatch(/"reason"|"source"|Didit|TIN/);
    expect(v.stages.find((s: any) => s.stage === "tax").safeLabel).toBe("Tax information required");
  });
  it("same investment yields the same checklist from fund and investor views", () => {
    const r = computeReadiness(input());
    const a: any = readinessView(r, "manager"), b: any = readinessView(r, "investor");
    expect(a.items.map((i: any) => [i.key, i.status])).toEqual(b.items.map((i: any) => [i.key, i.status]));
    expect(a.percentComplete).toBe(b.percentComplete);
  });
  it("different profiles produce independent results", () => {
    const a = computeReadiness(input({}, reqs({ profileType: "individual" })));
    const b = computeReadiness(input({}, reqs({ profileType: "llc", kyb: "not_started" })));
    expect(item(a, "entity_verification").status).not.toBe(item(b, "entity_verification").status);
  });
});

describe("audit and tasks", () => {
  it("automated transitions produce audit entries only when status changes", () => {
    const r = computeReadiness(input());
    const first = readinessTransitions({}, r);
    expect(first.length).toBe(r.items.length);
    const prev = Object.fromEntries(r.items.map((i) => [i.key, i.status]));
    expect(readinessTransitions(prev, r)).toEqual([]);
  });
  it("creates a task when action is required, never duplicates, resolves when source resolves", () => {
    const r = computeReadiness(input({}, reqs({ sig: false })));
    const p1 = readinessTaskPlan(new Set(), r);
    expect(p1.create.map((c) => c.key)).toContain("signature");
    const p2 = readinessTaskPlan(new Set(["signature"]), r);
    expect(p2.create.map((c) => c.key)).not.toContain("signature");
    const done = computeReadiness(input());
    expect(readinessTaskPlan(new Set(["signature"]), done).resolve).toContain("signature");
  });
});

describe("server wiring", () => {
  const src = readFileSync("src/lib/investor-onboarding.server.ts", "utf8");
  const seg = src.slice(src.indexOf("investment readiness"));
  it("uses the canonical access check and fund scoping", () => {
    expect(seg).toContain("assertOnboardingAccess(userId, onboardingId)");
    expect(seg).toContain('forbid("you do not manage that fund.")');
    expect(seg).toContain("readinessView(result, access.role)");
  });
  it("never writes to investment, compliance, funding or email records", () => {
    expect(seg).not.toMatch(/from\("investor_onboardings"\)\.(update|insert|upsert)/);
    expect(seg).not.toMatch(/sendOnboardInvitationEmail|send.*Email\(/);
    const writes = [...seg.matchAll(/from\("([a-z_]+)"\)\.(insert|update|upsert)/g)].map((m) => m[1]);
    expect(new Set(writes)).toEqual(new Set(["investment_readiness_events", "investment_readiness_tasks"]));
  });
  it("close readiness is not available to investors", () => {
    expect(seg).toContain('forbid("close readiness is a fund view.")');
  });
});
