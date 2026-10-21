import { describe, expect, it } from "vitest";
import { applyLocked, businessTypeFor, irsFormOptionFor, lockedAnswers, IDENTITY_DOCS_KEY } from "@/lib/subscription-prefill";
import { questionVisible, validateQuestionnaire, type Question } from "@/lib/investor-onboarding-model";
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
    expect(out.name_of_subscriber).toBe("Calvin Jung");
    expect(out.subscription_amount).toBe("$500,000.00");
  });
  it("question 16 shows and is required only after a No on the funding bank questions", () => {
    expect(questionVisible(q16, { [FATF]: "Yes", [CUSTOMER]: "Yes" })).toBe(false);
    expect(questionVisible(q16, { [FATF]: "No" })).toBe(true);
    expect(questionVisible(q16, { [FATF]: "Yes", [CUSTOMER]: "No" })).toBe(true);
    expect(validateQuestionnaire([q16], { [FATF]: "No" }).valid).toBe(false);
    expect(validateQuestionnaire([q16], { [FATF]: "Yes" }).valid).toBe(true);
    expect(validateQuestionnaire([{ ...q16, satisfiedBy: "Verification" }], { [FATF]: "No" }).valid).toBe(true);
  });
});
