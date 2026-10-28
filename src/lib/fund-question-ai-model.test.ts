import { describe, expect, it } from "vitest";
import { documentQuestionDraft, mappedQuestionFacts, type QuestionAiOutput } from "./fund-question-ai-model";
import { fillMissingInvestorAnswers } from "./subscription-prefill";
const output = (): QuestionAiOutput => ({ title: "Fund questions", questions: [{ label: "Subscriber city?", type: "text", required: true, options: [], sourceReference: "Subscription v4 page 2", sourceQuote: "Subscriber city", prefillKey: "city" }], alreadyCovered: [], warnings: [] });
describe("document questionnaire drafts", () => {
  it("adds document-backed questions and choices without replacing existing questions", () => {
    const existing = [{ key: "fs_old", label: "Source of funds?", type: "text" as const }];
    const result = documentQuestionDraft(output(), [], existing);
    expect(result.questions).toHaveLength(2); expect(result.questions[0]).toEqual(existing[0]);
    expect(result.questions[1]?.sourceReference).toBe("Subscription v4 page 2");
  });
  it("does not ask identical questions twice", () => {
    expect(documentQuestionDraft(output(), [{ key: "city", label: "Subscriber city?", type: "text" }], []).questions).toEqual([]);
  });
  it("fills only blank exact-party facts and preserves entered answers", () => {
    const qs = documentQuestionDraft(output(), [], []).questions;
    const key = qs[0]?.key ?? "missing";
    const supplied = mappedQuestionFacts(qs, { city: "Austin" });
    expect(fillMissingInvestorAnswers({}, supplied, [key])[key]).toBe("Austin");
    expect(fillMissingInvestorAnswers({ [key]: "Dallas" }, supplied, [key])[key]).toBe("Dallas");
    expect(fillMissingInvestorAnswers({ [key]: "" }, supplied, [key], [key])[key]).toBe("");
  });
  it("never maps certifications or eligibility answers", () => {
    expect(mappedQuestionFacts([{ key: "fs_cert", label: "I certify", type: "certification", prefillKey: "city" }], { city: "Austin" })).not.toHaveProperty("fs_cert");
    expect(mappedQuestionFacts([{ key: "fs_tax", label: "Tax ID", type: "text", prefillKey: "tax_id" }], { tax_id: "protected" })).not.toHaveProperty("fs_tax");
  });
  it("rejects missing evidence and missing multiselect choices", () => {
    const bad = output(); const q = bad.questions[0]; if (!q) throw new Error("Missing fixture");
    q.sourceQuote = ""; expect(() => documentQuestionDraft(bad, [], [])).toThrow("evidence");
    q.sourceQuote = "Choose all"; q.type = "multi_select";
    expect(() => documentQuestionDraft(bad, [], [])).toThrow("choices");
  });
});