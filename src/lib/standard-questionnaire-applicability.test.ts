import { describe, expect, it } from "vitest";
import questions from "./standard-investor-questionnaire.json";
import { questionAppliesToProfile, type Question } from "./investor-onboarding-model";

const qs = questions as unknown as Question[];
const find = (prefix: string) => qs.find((q) => q.key.startsWith(prefix))!;

describe("standard questionnaire party-type tags", () => {
  it("hides the ERISA plan-assets question from individuals and joint investors", () => {
    const q = find("is_the_subscriber_acting_on_behalf_of_an_entity");
    expect(questionAppliesToProfile(q, "individual")).toBe(false);
    expect(questionAppliesToProfile(q, "joint")).toBe(false);
    for (const t of ["ira", "retirement_plan", "trust", "llc"]) expect(questionAppliesToProfile(q, t)).toBe(true);
  });
  it("hides the life insurance question from individuals and IRAs", () => {
    const q = find("is_the_subscriber_a_life_insurance_company");
    expect(questionAppliesToProfile(q, "individual")).toBe(false);
    expect(questionAppliesToProfile(q, "ira")).toBe(false);
    expect(questionAppliesToProfile(q, "corporation")).toBe(true);
  });
  it("keeps disqualifying-event questions for every investor type", () => {
    const q = find("has_the_subscriber_or_any_of_its_beneficial_owners");
    expect(questionAppliesToProfile(q, "individual")).toBe(true);
    expect(questionAppliesToProfile(q, "trust")).toBe(true);
  });
});
