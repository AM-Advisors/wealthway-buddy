import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  badActorApplies, badActorRequirementState, canReuseTaxForm, certificationState, effectiveEligibility,
  eligibilityChecklistState, eligibilityOutcome, evaluateBadActor, managerTaxLabel, requiredCertifications,
  resolveTaxForm, taxFormExpiresOn, taxRequirementState, BAD_ACTOR_CATEGORIES,
} from "./onboarding-compliance-model";
import { determineOnboardingRequirements } from "./investor-onboarding-model";

const now = "2026-09-24T12:00:00Z";
const allNo = Object.fromEntries(BAD_ACTOR_CATEGORIES.map((c) => [c.key, "no"]));

describe("tax routing", () => {
  it("U.S. individual → W-9", () => expect(resolveTaxForm({ profileType: "individual", usPerson: true })).toMatchObject({ formType: "w9" }));
  it("U.S. LLC → W-9 with entity classification", () =>
    expect(resolveTaxForm({ profileType: "llc", usPerson: true })).toMatchObject({ formType: "w9", classification: "us_llc" }));
  it("foreign individual is never forced into W-9", () =>
    expect(resolveTaxForm({ profileType: "individual", usPerson: false })).toMatchObject({ formType: "w8ben" }));
  it("W-8 routing", () => {
    expect(resolveTaxForm({ profileType: "corporation", usPerson: false })).toMatchObject({ formType: "w8bene" });
    expect(resolveTaxForm({ profileType: "partnership", usPerson: false, intermediaryOrFlowThrough: true })).toMatchObject({ formType: "w8imy" });
    expect(resolveTaxForm({ profileType: "foundation", usPerson: false, foreignGovernmentOrExempt: true })).toMatchObject({ formType: "w8exp" });
    expect(resolveTaxForm({ profileType: "individual", usPerson: false, claimsEffectivelyConnectedIncome: true })).toMatchObject({ formType: "w8eci" });
  });
  it("uncertain facts → review, not a guessed form", () => {
    expect(resolveTaxForm({ profileType: "individual", usPerson: null }).status).toBe("needs_review");
    expect(resolveTaxForm({ profileType: "ira", usPerson: false }).status).toBe("needs_review");
    expect(resolveTaxForm({ profileType: "llc", usPerson: false, intermediaryOrFlowThrough: true, claimsEffectivelyConnectedIncome: true }).status).toBe("needs_review");
  });
  it("W-9 not complete without a certified record", () => {
    const routing = resolveTaxForm({ profileType: "individual", usPerson: true });
    expect(taxRequirementState({ required: true, routing, profileId: "p1", forms: [], nowIso: now }).state).toBe("missing");
    expect(taxRequirementState({ required: true, routing, profileId: "p1", forms: [{ investment_profile_id: "p1", form_type: "w9", classification: "us_individual", status: "certified" }], nowIso: now }).state).toBe("valid");
  });
  it("another profile's form is never reused", () => {
    const f = { investment_profile_id: "p1", form_type: "w9", classification: "us_individual", status: "certified" };
    expect(canReuseTaxForm(f, { profileId: "p2", formType: "w9", classification: "us_individual", nowIso: now })).toBe(false);
    expect(canReuseTaxForm(f, { profileId: "p1", formType: "w9", classification: "us_llc", nowIso: now })).toBe(false);
    expect(canReuseTaxForm({ ...f, tin_fingerprint: "a" }, { profileId: "p1", formType: "w9", classification: "us_individual", tinFingerprint: "b", nowIso: now })).toBe(false);
  });
  it("superseded / expired forms don't count", () => {
    const routing = resolveTaxForm({ profileType: "individual", usPerson: false });
    const base = { investment_profile_id: "p1", form_type: "w8ben", classification: "foreign_individual" };
    expect(taxRequirementState({ required: true, routing, profileId: "p1", forms: [{ ...base, status: "superseded" }], nowIso: now }).state).toBe("missing");
    expect(taxRequirementState({ required: true, routing, profileId: "p1", forms: [{ ...base, status: "certified", expires_on: "2025-12-31" }], nowIso: now }).state).toBe("refresh_required");
    expect(taxFormExpiresOn("w8ben", now)).toBe("2029-12-31");
    expect(taxFormExpiresOn("w9", now)).toBeNull();
  });
  it("manager sees only coarse tax labels", () => {
    expect(managerTaxLabel("valid")).toBe("Tax — Complete");
    expect(managerTaxLabel("review_required")).toBe("Tax — Needs Attention");
  });
  it("TIN is never stored in full and never returned to managers", () => {
    const srv = readFileSync("src/lib/onboarding-compliance.server.ts", "utf8");
    expect(srv).toMatch(/encryptTin\(input\.tin\)/); expect(srv).not.toMatch(/\btin: input\.tin,/);
    expect(srv).toMatch(/tin_last4/);
    const mgr = readFileSync("src/lib/investor-onboarding.server.ts", "utf8");
    const board = mgr.slice(mgr.indexOf("export async function managerOnboardingBoard"), mgr.indexOf("export async function inviteInvestor"));
    expect(board).not.toMatch(/tin_|tax_id/);
  });
  it("certified tax forms are immutable in the database", () => {
    const sql = readFileSync("drizzle/migrations/0035_tax_forms_bad_actor_certifications.sql", "utf8");
    expect(sql).toMatch(/Certified tax forms cannot be rewritten/);
    expect(sql).toMatch(/Superseded tax forms stay superseded/);
  });
});

describe("Bad Actor", () => {
  it("only when applicable", () => {
    expect(badActorApplies(null, ["manager"])).toBe(false);
    expect(badActorApplies({ required: true }, [])).toBe(false);
    expect(badActorApplies({ required: true }, ["manager"])).toBe(true);
    expect(badActorApplies({ required: true, coveredRoles: ["promoter"] }, ["manager"])).toBe(false);
    expect(badActorApplies({ required: true, applyToAllInvestors: true }, [])).toBe(true);
  });
  it("a yes goes to review; nothing auto-approves or rejects", () => {
    expect(evaluateBadActor({ ...allNo, "506d_1_i": "yes" }).reviewStatus).toBe("review_required");
    expect(badActorRequirementState({ applies: true, latest: { review_status: "review_required" } }).state).toBe("review_required");
    expect(evaluateBadActor({}).complete).toBe(false);
  });
  it("certified responses are immutable; version stored", () => {
    const sql = readFileSync("drizzle/migrations/0035_tax_forms_bad_actor_certifications.sql", "utf8");
    expect(sql).toMatch(/Certified questionnaire answers cannot be rewritten/);
    expect(sql).toMatch(/questionnaire_version integer NOT NULL/);
  });
  it("managers have no read path to responses", () => {
    const sql = readFileSync("drizzle/migrations/0035_tax_forms_bad_actor_certifications.sql", "utf8");
    const pols = sql.split("compliance_questionnaire_responses").join("");
    expect(pols).not.toMatch(/fund_managers/);
  });
});

describe("offering eligibility", () => {
  it("manager cannot weaken a mandatory requirement", () => {
    const eff = effectiveEligibility({ regType: "506c", approved: [], managerProposed: [{ key: "accredited_investor", category: "regulatory", mandatory: false }] });
    expect(eff.find((r) => r.key === "accredited_investor")!.mandatory).toBe(true);
  });
  it("Fund A config doesn't leak into Fund B", () => {
    const a = effectiveEligibility({ regType: "506b", approved: [{ key: "qualified_purchaser", category: "regulatory", mandatory: true }] });
    const b = effectiveEligibility({ regType: "506b", approved: [] });
    expect(a.length).toBe(1); expect(b.length).toBe(0);
  });
  it("needs review never equals satisfied; optional doesn't block", () => {
    const req = { key: "finra_affiliation" as const, category: "representation" as const, mandatory: true, reviewOnFlag: true };
    expect(eligibilityOutcome(req, { value: "flag" })).toBe("needs_review");
    expect(eligibilityChecklistState(["needs_review"])).toBe("review_required");
    expect(eligibilityOutcome({ ...req, mandatory: false }, undefined)).toBe("not_applicable");
    expect(eligibilityChecklistState(["not_applicable"])).toBe("not_applicable");
  });
});

describe("certifications", () => {
  it("entity adds authority; each certification distinct", () => {
    expect(requiredCertifications({ isEntityOrDelegated: true, hasOfferingRepresentations: false })).toContain("authority_capacity");
    expect(requiredCertifications({ isEntityOrDelegated: false, hasOfferingRepresentations: false })).not.toContain("authority_capacity");
    expect(certificationState(["accuracy", "privacy_terms"], [{ certification_key: "accuracy", certification_version: 1 }]).missing).toEqual(["privacy_terms"]);
  });
});

describe("checklist integration", () => {
  it("Stage 2 results drive the one checklist", () => {
    const r = determineOnboardingRequirements({
      offering: { accreditationRequired: false, kycRequired: false, kybRequired: false, amlRequired: false, taxDocumentRequired: true, subscriptionQuestionnaireRequired: false } as any,
      person: { personId: "p" }, profile: { profileId: "x", profileType: "individual" }, subscription: {}, nowIso: now,
      compliance: { tax: { state: "review_required" }, badActor: { state: "missing" }, certifications: { state: "missing" }, offeringEligibility: { state: "review_required" } },
    });
    const by = (k: string) => r.find((x) => x.key === k)!.state;
    expect(by("tax_documentation")).toBe("review_required");
    expect(by("bad_actor")).toBe("missing");
    expect(by("certifications")).toBe("missing");
    expect(by("eligibility")).toBe("review_required");
  });
});
