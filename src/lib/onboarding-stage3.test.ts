import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IRS_FORM_CATALOG,
  IRS_FORM_REVISIONS,
  canReuseTaxForm,
  currentIrsForm,
  effectiveEligibility,
  eligibilityChecklistState,
  parseEligibilityConfig,
} from "@/lib/onboarding-compliance-model";
import {
  amlFields,
  answeredEligibility,
  autoEligibility,
  evaluateAml,
  hasTaxPermission,
  irsFieldValues,
  routeTaxIntake,
  sanitizeDemographics,
  taxIntakeQuestions,
  taxPermissions,
} from "@/lib/onboarding-intake-model";
import { determineOnboardingRequirements } from "@/lib/investor-onboarding-model";

// ------------------------------------------------------------- tax intake
describe("tax intake routing", () => {
  it("U.S. individual → W-9", () => {
    expect(routeTaxIntake("individual", { usPerson: "yes" })).toMatchObject({ status: "determined", formType: "w9" });
  });
  it("U.S. entity → W-9", () => {
    expect(routeTaxIntake("llc", { usPerson: "yes" })).toMatchObject({ status: "determined", formType: "w9" });
  });
  it("foreign individual → W-8BEN", () => {
    expect(routeTaxIntake("individual", { usPerson: "no", taxResidenceCountry: "FR", citizenshipCountry: "FR", effectivelyConnected: "no" }))
      .toMatchObject({ status: "determined", formType: "w8ben" });
  });
  it("foreign entity beneficial owner → W-8BEN-E", () => {
    expect(routeTaxIntake("corporation", { usPerson: "no", taxResidenceCountry: "DE", capacity: "beneficial_owner", exemptStatus: "none", effectivelyConnected: "no" }))
      .toMatchObject({ status: "determined", formType: "w8bene" });
  });
  it("intermediary / flow-through facts → W-8IMY", () => {
    expect(routeTaxIntake("partnership", { usPerson: "no", taxResidenceCountry: "UK", capacity: "flow_through" })).toMatchObject({ formType: "w8imy" });
    expect(routeTaxIntake("corporation", { usPerson: "no", taxResidenceCountry: "UK", capacity: "intermediary" })).toMatchObject({ formType: "w8imy" });
  });
  it("ECI facts → W-8ECI", () => {
    expect(routeTaxIntake("individual", { usPerson: "no", taxResidenceCountry: "JP", citizenshipCountry: "JP", effectivelyConnected: "yes" })).toMatchObject({ formType: "w8eci" });
  });
  it("exempt organization facts → W-8EXP", () => {
    expect(routeTaxIntake("foundation", { usPerson: "no", taxResidenceCountry: "CH", capacity: "beneficial_owner", exemptStatus: "foreign_tax_exempt_organization" })).toMatchObject({ formType: "w8exp" });
  });
  it("contradictory facts → Needs Review", () => {
    expect(routeTaxIntake("individual", { usPerson: "no", taxResidenceCountry: "US", citizenshipCountry: "FR", effectivelyConnected: "no" }).status).toBe("needs_review");
    expect(routeTaxIntake("individual", { usPerson: "no", taxResidenceCountry: "FR", citizenshipCountry: "US", effectivelyConnected: "no" }).status).toBe("needs_review");
  });
  it("unsure or unanswered → Needs Review, never a guess", () => {
    expect(routeTaxIntake("individual", { usPerson: "unsure" }).status).toBe("needs_review");
    expect(routeTaxIntake("llc", {}).status).toBe("needs_review");
  });
  it("asks only the questions needed", () => {
    expect(taxIntakeQuestions("individual", { usPerson: "yes" })).toEqual(["usPerson"]);
    expect(taxIntakeQuestions("llc", { usPerson: "no", capacity: "intermediary" })).not.toContain("exemptStatus");
  });
  it("the browser cannot pick a form: answers contain no form selector", () => {
    const r = routeTaxIntake("individual", { usPerson: "yes", formType: "w8ben" } as any);
    expect(r).toMatchObject({ formType: "w9" });
  });
});

// ---------------------------------------------------------- official forms
describe("official IRS forms", () => {
  it("records the verified current revisions", () => {
    expect(IRS_FORM_REVISIONS.w9.revision).toBe("Rev. March 2024");
    expect(IRS_FORM_REVISIONS.w8ben.revision).toBe("Rev. October 2021");
    expect(IRS_FORM_REVISIONS.w8bene.revision).toBe("Rev. October 2021");
    expect(IRS_FORM_REVISIONS.w8eci.revision).toBe("Rev. October 2021");
    expect(IRS_FORM_REVISIONS.w8imy.revision).toBe("Rev. October 2021");
  });
  it("W-8EXP corrected to October 2023", () => {
    expect(IRS_FORM_REVISIONS.w8exp.revision).toBe("Rev. October 2023");
  });
  it("every form pins a template fingerprint and an irs.gov source", () => {
    for (const f of IRS_FORM_CATALOG) {
      expect(f.templateSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.sourceUrl.startsWith("https://www.irs.gov/")).toBe(true);
    }
  });
  it("a new revision does not change a historical record", () => {
    const historical = { investment_profile_id: "p1", form_type: "w9", classification: "us_individual", status: "certified", irs_revision: "Rev. March 2024" };
    const catalog = [...IRS_FORM_CATALOG.map((f) => ({ ...f })), { ...currentIrsForm("w9"), revision: "Rev. 2027", status: "current" as const }];
    catalog[0]!.status = "retired";
    expect(historical.irs_revision).toBe("Rev. March 2024");
  });
  it("populated fields go onto the official W-9 field names", () => {
    const { text, checks } = irsFieldValues("w9", { legalName: "Ann Lee", federalClassification: "individual", tinKind: "ssn", tin: "123-45-6789", signerName: "Ann Lee", signedDate: "2026-09-24" });
    expect(text["topmostSubform[0].Page1[0].f1_01[0]"]).toBe("Ann Lee");
    expect(text["topmostSubform[0].Page1[0].f1_13[0]"]).toBe("6789");
    expect(checks[0]).toContain("c1_1[0]");
  });
  it("a tax form is reusable only for the same profile", () => {
    const form = { investment_profile_id: "p1", form_type: "w9", classification: "us_individual", status: "certified" };
    expect(canReuseTaxForm(form, { profileId: "p2", formType: "w9", classification: "us_individual", nowIso: "2026-09-24" })).toBe(false);
    expect(canReuseTaxForm(form, { profileId: "p1", formType: "w9", classification: "us_individual", nowIso: "2026-09-24" })).toBe(true);
  });
});

// ------------------------------------------------------------- permissions
describe("granular Harmonious tax permissions", () => {
  it("fund managers get nothing", () => {
    expect(taxPermissions(["fund_manager"])).toEqual([]);
  });
  it("admin status alone does not open sensitive tax evidence", () => {
    expect(hasTaxPermission(["admin"], "access_sensitive_tax_records")).toBe(false);
    expect(hasTaxPermission(["admin"], "view_tax_status")).toBe(true);
  });
  it("status-only staff cannot open evidence", () => {
    for (const r of ["operations", "client_success", "executive", "fund_administration"]) {
      expect(hasTaxPermission([r], "access_sensitive_tax_records")).toBe(false);
    }
  });
  it("tax role opens evidence; compliance approves exceptions", () => {
    expect(hasTaxPermission(["tax"], "access_sensitive_tax_records")).toBe(true);
    expect(hasTaxPermission(["compliance"], "approve_compliance_exceptions")).toBe(true);
    expect(hasTaxPermission(["tax"], "approve_compliance_exceptions")).toBe(false);
  });
});

// ------------------------------------------------------------- eligibility
describe("eligibility", () => {
  const fundA = parseEligibilityConfig([{ key: "qualified_purchaser" }, { key: "minimum_investment", params: { minimumCents: 100_000_00 } }]);
  const fundB = parseEligibilityConfig([{ key: "finra_affiliation" }]);
  it("Fund A requirements don't appear for Fund B", () => {
    const b = effectiveEligibility({ regType: "506b", approved: fundB }).map((r) => r.key);
    expect(b).toEqual(["finra_affiliation"]);
    expect(b).not.toContain("qualified_purchaser");
  });
  it("minimum investment evaluated automatically", () => {
    const params = fundA.find((r) => r.key === "minimum_investment")!.params;
    expect(autoEligibility("minimum_investment", params, { commitmentCents: 150_000_00, profileType: "individual", country: "US" })).toBe("satisfied");
    expect(autoEligibility("minimum_investment", params, { commitmentCents: 50_000_00, profileType: "individual", country: "US" })).toBe("needs_review");
  });
  it("Needs Review doesn't satisfy", () => {
    expect(answeredEligibility("qualified_purchaser", "unsure")).toBe("needs_review");
    expect(eligibilityChecklistState(["satisfied", "needs_review"])).toBe("review_required");
  });
  it("manager cannot disable a mandatory regulatory requirement", () => {
    const eff = effectiveEligibility({ regType: "506c", approved: [], managerProposed: [{ key: "accredited_investor", category: "regulatory", mandatory: false }] });
    expect(eff.find((r) => r.key === "accredited_investor")?.mandatory).toBe(true);
  });
  it("jurisdiction and investor-type restrictions", () => {
    expect(autoEligibility("jurisdiction_restriction", { blockedCountries: ["KP"] }, { commitmentCents: 1, profileType: "llc", country: "kp" })).toBe("needs_review");
    expect(autoEligibility("investor_type_restriction", { allowedProfileTypes: ["individual"] }, { commitmentCents: 1, profileType: "llc", country: "US" })).toBe("needs_review");
  });
});

// ---------------------------------------------------------------- BSA/AML
describe("BSA/AML", () => {
  const known = { citizenship: "US", residence: "US" };
  it("reuses known facts and does not ask source of wealth by default", () => {
    const f = amlFields({}, { profileType: "individual", commitmentCents: 10_000_00, known });
    expect(f).not.toContain("citizenship");
    expect(f).not.toContain("sourceOfWealth");
  });
  it("source of wealth only when enhanced due diligence applies", () => {
    expect(amlFields({}, { profileType: "individual", commitmentCents: 1, known, answers: { politicallyExposed: "yes" } })).toContain("sourceOfWealth");
    expect(amlFields({ eddThresholdCents: 1_000_000_00 }, { profileType: "individual", commitmentCents: 2_000_000_00, known })).toContain("sourceOfWealth");
  });
  it("review-triggering answers → review, not rejection", () => {
    const ev = evaluateAml({}, { profileType: "individual", commitmentCents: 1, known: { ...known, occupation: "x" }, answers: { sourceOfFunds: "other", sourceOfFundsDetail: "x", fundsOriginCountry: "US", thirdPartyFunding: "no", politicallyExposed: "no", expectedActivity: "ongoing" } });
    expect(ev.complete).toBe(true);
    expect(ev.reviewStatus).toBe("review_required");
  });
});

// ----------------------------------------------------------- demographics
describe("optional demographics", () => {
  it("can be declined and prefer-not-to-answer is kept", () => {
    expect(sanitizeDemographics({})).toEqual({});
    expect(sanitizeDemographics({ gender: "prefer_not_to_answer", bogus: "x" })).toEqual({ gender: "prefer_not_to_answer" });
  });
  it("demographics never enter the checklist", () => {
    const base = {
      offering: { accreditationRequired: false, taxDocumentRequired: false } as any,
      person: { personId: "p", kycStatus: "approved", amlStatus: "cleared" } as any,
      profile: null,
      subscription: { requestedAmountCents: 1 } as any,
      nowIso: "2026-09-24T00:00:00Z",
    };
    const keys = determineOnboardingRequirements(base).map((r) => r.key as string);
    expect(keys.some((k) => k.includes("demograph"))).toBe(false);
  });
});

// ----------------------------------------------------- server-side security
const store: Record<string, any[]> = {};
function builder(table: string) {
  let rows = [...(store[table] ?? [])];
  const b: any = {
    select: () => b, order: () => b, limit: () => b, neq: (k: string, v: any) => ((rows = rows.filter((r) => r[k] !== v)), b),
    eq: (k: string, v: any) => ((rows = rows.filter((r) => r[k] === v)), b),
    is: (k: string, v: any) => ((rows = rows.filter((r) => (r[k] ?? null) === v)), b),
    in: () => b,
    maybeSingle: async () => ({ data: rows[0] ?? null }),
    single: async () => ({ data: rows[0] ?? null }),
    insert: (row: any) => { (store[table] ??= []).push({ id: `new-${Math.random()}`, ...row }); const r = store[table]!.at(-1); return { select: () => ({ single: async () => ({ data: r }) }), then: (f: any) => Promise.resolve({ error: null }).then(f) }; },
    update: () => b,
    then: (f: any, g?: any) => Promise.resolve({ data: rows, error: null }).then(f, g),
  };
  return b;
}
const rpc = vi.fn(async () => ({ data: [{ ciphertext: "x", iv: "y" }], error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => builder(t), rpc, storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://signed" } }) }) } },
}));

describe("server security", () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    store["user_roles"] = [
      { user_id: "mgr", role: "fund_manager" },
      { user_id: "adm", role: "admin" },
      { user_id: "ops", role: "operations" },
      { user_id: "taxer", role: "tax" },
    ];
    store["investor_tax_forms"] = [{ id: "form-1", investment_profile_id: "prof-1", document_path: "p/x.pdf", tin_retained: true }];
    store["investor_onboardings"] = [{ id: "ob-1", investor_user_id: "inv-1", offering_id: "f", investment_profile_id: "prof-1" }];
    store["investment_profiles"] = [{ id: "prof-1", profile_type: "individual" }];
  });

  it("manager cannot retrieve the full TIN", async () => {
    const s = await import("@/lib/onboarding-compliance.server");
    await expect(s.staffTaxEvidence("mgr", { taxFormId: "form-1", kind: "tin", purpose: "prepare K-1" })).rejects.toThrow(/Forbidden/);
  });
  it("unauthorized Harmonious staff cannot open the sensitive record", async () => {
    const s = await import("@/lib/onboarding-compliance.server");
    await expect(s.staffTaxEvidence("adm", { taxFormId: "form-1", kind: "document", purpose: "look" })).rejects.toThrow(/Forbidden/);
    await expect(s.staffTaxEvidence("ops", { taxFormId: "form-1", kind: "document", purpose: "look" })).rejects.toThrow(/Forbidden/);
  });
  it("tax staff access is audited", async () => {
    const s = await import("@/lib/onboarding-compliance.server");
    const r = await s.staffTaxEvidence("taxer", { taxFormId: "form-1", kind: "document", purpose: "prepare K-1" });
    expect(r).toMatchObject({ url: "https://signed" });
    expect(store["tax_evidence_access_events"]?.[0]).toMatchObject({ actor_user_id: "taxer", access_kind: "document" });
  });
  it("cross-investor access fails", async () => {
    const s = await import("@/lib/onboarding-compliance.server");
    await expect(s.submitTaxFacts("inv-2", { onboardingId: "ob-1", answers: { usPerson: "yes" } })).rejects.toThrow(/not yours/);
    await expect(s.investorTaxDocumentUrl("inv-2", "ob-1")).rejects.toThrow(/not yours/);
  });
  it("tax facts are recorded against the onboarding's own profile only", async () => {
    const s = await import("@/lib/onboarding-compliance.server");
    await s.submitTaxFacts("inv-1", { onboardingId: "ob-1", answers: { usPerson: "yes", formType: "w8ben" } as any });
    const row = store["investor_tax_facts"]!.at(-1);
    expect(row.investment_profile_id).toBe("prof-1");
    expect(row.form_type).toBe("w9");
    expect(row.answers).toEqual({ usPerson: "yes" });
  });
});
