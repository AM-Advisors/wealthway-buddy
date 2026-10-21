import { describe, expect, it } from "vitest";
import { applyLocked, businessTypeFor, irsFormOptionFor, lockedAnswers, IDENTITY_DOCS_KEY } from "@/lib/subscription-prefill";
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
});
