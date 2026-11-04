import { describe, expect, it } from "vitest";
import { questionnaireCompletion } from "./questionnaire-completion";
import { ACCREDITATION_QUESTION_KEY } from "./accreditation-step";
import type { Question } from "./investor-onboarding-model";

const questions: Question[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "confirm", label: "Confirm", type: "certification", required: true },
  { key: "optional", label: "Optional", type: "text" },
];
const submitted = { submittedAt: "2026-10-21T21:59:38Z", version: 1, questions, profileType: "individual" };
describe("questionnaire completion evidence", () => {
  it("does not count an imported accreditation-only response as complete", () => {
    const result = questionnaireCompletion({ ...submitted, answers: { [ACCREDITATION_QUESTION_KEY]: "Net worth over $1 million" } });
    expect(result.complete).toBe(false);
    expect(result.missingRequired).toBe(2);
  });
  it("requires investor submission even when a draft has all answers", () => {
    expect(questionnaireCompletion({ ...submitted, submittedAt: null, answers: { name: "Example investor", confirm: true } }).complete).toBe(false);
  });
  it("allows required answers with an optional blank", () => {
    expect(questionnaireCompletion({ ...submitted, answers: { name: "Example investor", confirm: true } }).complete).toBe(true);
  });
  it("does not ask an individual for a trust-only question", () => {
    expect(questionnaireCompletion({ ...submitted, questions: [...questions, { key: "trustee", label: "Trustee", type: "text", required: true, appliesTo: ["trust"] }], answers: { name: "Example investor", confirm: true } }).complete).toBe(true);
  });
  it("requires a visible conditional answer only", () => {
    const conditional: Question[] = [{ key: "followup", label: "Follow up", type: "text", required: true, showWhen: { key: "parent", equals: ["Yes"] } }];
    expect(questionnaireCompletion({ ...submitted, questions: conditional, answers: { parent: "No" } }).complete).toBe(true);
    expect(questionnaireCompletion({ ...submitted, questions: conditional, answers: { parent: "Yes" } }).complete).toBe(false);
  });
  it("does not fabricate a missing certification or accept an unavailable definition", () => {
    expect(questionnaireCompletion({ ...submitted, answers: { name: "Example investor", confirm: false } }).complete).toBe(false);
    expect(questionnaireCompletion({ ...submitted, questions: null }).complete).toBe(false);
  });
});