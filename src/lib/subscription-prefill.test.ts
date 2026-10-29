import { describe, expect, it } from "vitest";
import { usPersonFromVerification, applyLocked, businessTypeFor, irsFormOptionFor, lockedAnswers, IDENTITY_DOCS_KEY } from "@/lib/subscription-prefill";
import { highRiskYes, stripHiddenAnswers, questionVisible, validateQuestionnaire, type Question } from "@/lib/investor-onboarding-model";
import standard from "@/lib/standard-investor-questionnaire.json";

const q16 = (standard as Question[]).find((q) => q.key === IDENTITY_DOCS_KEY)!;
const FATF = "is_the_funding_bank_located_in_the_united_states_or_another_";
const CUSTOMER = "if_the_subscriber_answered_yes_is_the_subscriber_a_customer_";

describe("subscription prefill", () => {
  it("maps profile type to business type", () => {
    expect(businessTypeFor("individual")).toBe("Single Individual (one signatory required)");
    expect(businessTypeFor("llc")).toBe("Limited Liability Company");
    expect(businessTypeFor("joint")).toBeNull();
  });
  it("maps tax form to IRS option", () => {
    expect(irsFormOptionFor("w9")).toMatch(/^W-9/);
    expect(irsFormOptionFor("w8ben")).toMatch(/^W-8BEN \(/);
    expect(irsFormOptionFor("w8bene")).toBe("W-8BENE");
  });
  it("locked values override what the browser sent", () => {
    const locked = lockedAnswers({ verifiedName: "Calvin Jung", commitmentCents: 50_000_000, email: "c@x.com", phone: "1", profileType: "individual", taxFormType: "w9" });
    const out = applyLocked({ name_of_subscriber: "Someone Else", subscription_amount: "$1" }, locked, Object.keys(locked));
    expect(out["name_of_subscriber"]).toBe("Calvin Jung");
    expect(out["subscription_amount"]).toBe("$500,000.00");
  });
  const Q = standard as Question[];
  const WIRE = "is_the_jurisdiction_where_the_wiring_institution_is_located_";
  it("question 14 shows only after Yes on question 13", () => {
    const q14 = Q.find((q) => q.key === CUSTOMER)!;
    expect(questionVisible(q14, { [FATF]: "Yes" })).toBe(true);
    expect(questionVisible(q14, { [FATF]: "No" })).toBe(false);
  });
  it("question 16 shows and is required only after Yes on question 15", () => {
    expect(questionVisible(q16, { [WIRE]: "No", [FATF]: "No" })).toBe(false);
    expect(questionVisible(q16, { [WIRE]: "Yes" })).toBe(true);
    expect(validateQuestionnaire([q16], { [WIRE]: "Yes" }).valid).toBe(false);
    expect(validateQuestionnaire([q16], { [WIRE]: "No" }).valid).toBe(true);
  });
  it("hidden answers are dropped", () => {
    const out = stripHiddenAnswers(Q, { [FATF]: "No", [CUSTOMER]: "Yes" });
    expect(out[CUSTOMER]).toBeUndefined();
  });
  it("any Yes on questions 17-24 flags review; all No does not", () => {
    const bad = Q.filter((q) => q.highRisk);
    expect(bad.map((q) => Q.indexOf(q) + 1)).toEqual([17, 18, 19, 20, 21, 22, 23, 24]);
    expect(highRiskYes(Q, Object.fromEntries(bad.map((q) => [q.key, "No"])))).toEqual([]);
    expect(highRiskYes(Q, { [bad[3]!.key]: "Yes" }).map((f) => f.number)).toEqual([20]);
  });
  it("question 9 follows Verification: U.S. citizen W-9, otherwise W-8 by person or business", () => {
    expect(usPersonFromVerification({ isIndividual: true, citizenshipCountry: "US" })).toBe(true);
    expect(usPersonFromVerification({ isIndividual: true, documentCountry: "USA" })).toBe(true);
    expect(usPersonFromVerification({ isIndividual: true, citizenshipCountry: "CA", documentCountry: "US" })).toBe(false);
    expect(usPersonFromVerification({ isIndividual: false, entityCountry: "KY" })).toBe(false);
    expect(usPersonFromVerification({ isIndividual: true })).toBeNull();
  });
});

import { priorFactAnswers } from "./subscription-prefill";
describe("answers reused from another fund", () => {
  it("reuses address and funding bank", () => {
    const out = priorFactAnswers([{ subscriber_s_address_of_residence: "1 Main St", name_of_the_bank_from_which_the_subscriber_s_payment_to_the_: "Chase" }]);
    expect(out["subscriber_s_address_of_residence"]).toBe("1 Main St");
    expect(out["name_of_the_bank_from_which_the_subscriber_s_payment_to_the_"]).toBe("Chase");
  });
  it("never reuses accreditation, consent or compliance answers", () => {
    const out = priorFactAnswers([{ please_select_the_accreditation_that_applies_to_you: "Net worth", i_agree_to_electronic_delivery_of_disclosures_and_schedule_k: "Yes", has_the_subscriber_been_convicted_within_the_past_ten_years_: "No" }]);
    expect(Object.keys(out)).toEqual([]);
  });
  it("newest fund wins", () => {
    expect(priorFactAnswers([{ subscriber_s_address_of_residence: "New" }, { subscriber_s_address_of_residence: "Old" }])["subscriber_s_address_of_residence"]).toBe("New");
  });
});
