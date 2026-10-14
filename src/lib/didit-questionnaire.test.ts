import { describe, expect, it } from "vitest";
import { answersFromDidit, questionsFromDidit } from "@/lib/didit-questionnaire";

const responses = [{ sections: [{ items: [
  { title: "Name of Subscriber", element_type: "SHORT_TEXT", is_required: true, answer: { value: "Pat Example" } },
  { title: "Taxpayer Identification Number or Social Security Number", element_type: "SHORT_TEXT", answer: { value: "123456789" } },
  { title: "Account Number", element_type: "SHORT_TEXT", answer: { value: "999" } },
  { title: "Routing / ABA Number / SWIFT Code:", element_type: "SHORT_TEXT", answer: { value: "111" } },
  { title: "IRS form", element_type: "SINGLE_CHOICE", choices: [{ label: "W-9", value: "value_1" }, { label: "W-8BEN", value: "value_2" }], answer: { value: "value_2" } },
  { title: "Address", element_type: "ADDRESS", answer: { value: { street: "1 Main", city: "Austin", state: "TX", postalCode: "78701", country: "USA" } } },
] }] }];

describe("didit questionnaire mapping", () => {
  it("never carries tax IDs or bank numbers", () => {
    const text = JSON.stringify([questionsFromDidit(responses), answersFromDidit(responses)]);
    expect(text).not.toMatch(/123456789|"999"|"111"|Taxpayer|Account Number|Routing/);
  });
  it("maps choices to labels and addresses to text", () => {
    const a = answersFromDidit(responses);
    expect(a["irs_form"]).toBe("W-8BEN");
    expect(a["address"]).toBe("1 Main, Austin, TX, 78701, USA");
    expect(questionsFromDidit(responses).find((q) => q.key === "irs_form")).toMatchObject({ type: "select", options: ["W-9", "W-8BEN"] });
  });
});
