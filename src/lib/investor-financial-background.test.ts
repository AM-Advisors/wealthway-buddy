import { describe, expect, it } from "vitest";
import { financialBackgroundFields, financialBackgroundKnown } from "./investor-financial-background";
import { amlFields, evaluateAml } from "./onboarding-intake-model";

describe("applicable financial background", () => {
  it("reuses exact individual citizenship, residence and saved occupation", () => {
    const known = financialBackgroundKnown({ citizenship_country: "US", country: "US" }, { profile_type: "individual" }, { occupation: "Engineer" });
    expect(known).toEqual({ citizenship: "US", residence: "US", occupation: "Engineer", businessNature: null });
    expect(amlFields({}, { profileType: "individual", commitmentCents: 25000000, known })).not.toEqual(expect.arrayContaining(["citizenship", "residence", "occupation"]));
  });
  it("never uses a login signer's personal facts for an entity", () => {
    expect(financialBackgroundKnown({ citizenship_country: "US", country: "US" }, { profile_type: "trust", country: "CA" })).toEqual({ citizenship: null, residence: "CA", occupation: null, businessNature: null });
  });
  it("asks source of wealth only for applicable enhanced due diligence", () => {
    const base = amlFields({}, { profileType: "individual", commitmentCents: 25000000, known: {} });
    expect(financialBackgroundFields(base, { politicallyExposed: "no" })).not.toContain("sourceOfWealth");
    expect(financialBackgroundFields(base, { politicallyExposed: "yes" })).toEqual(expect.arrayContaining(["sourceOfWealth", "sourceOfWealthDetail"]));
  });
  it("requires other-source detail only when other is selected", () => {
    expect(financialBackgroundFields(["sourceOfFunds", "sourceOfFundsDetail"], { sourceOfFunds: "employment_income" })).toEqual(["sourceOfFunds"]);
    expect(financialBackgroundFields(["sourceOfFunds"], { sourceOfFunds: "other" })).toEqual(["sourceOfFunds", "sourceOfFundsDetail"]);
  });
  it("retains actual risk review when financial answers are complete", () => {
    expect(evaluateAml({}, { profileType: "individual", commitmentCents: 1, known: { citizenship: "US", residence: "US", occupation: "Engineer" }, answers: { sourceOfFunds: "employment_income", fundsOriginCountry: "US", thirdPartyFunding: "yes", politicallyExposed: "no", expectedActivity: "single_investment" } })).toMatchObject({ complete: true, reviewStatus: "review_required" });
  });
});