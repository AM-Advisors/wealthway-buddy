import { describe, expect, it } from "vitest";
import { questionnaireCompletion } from "./questionnaire-completion";
import { ACCREDITATION_QUESTION_KEY } from "./accreditation-step";
import type { Question } from "./investor-onboarding-model";
import { loadCompletionQuestions, questionnaireCompletionForRows } from "./questionnaire-completion.server";

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

describe("persisted questionnaire read-back", () => {
  function database() {
    const tables: Record<string, any[]> = {
      offering_questionnaires: [{ offering_id: "fund", status: "published", version: 1, questions }],
      fund_questionnaire_sections: [{ offering_id: "fund", status: "approved", version: 1, title: "Extra", questions: [{ key: "fs_fact", label: "Extra fact", required: true, type: "text" }] }],
      investment_profiles: [{ id: "profile", profile_type: "individual" }],
    };
    let fail = false;
    const d = { from(table: string) {
      let rows = tables[table] ?? [];
      const q: any = {
        select: () => q,
        in: (key: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[key])); return q; },
        eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return q; },
        order: () => q,
        then: (resolve: any) => resolve({ data: rows, error: fail ? { message: "unavailable" } : null }),
      };
      return q;
    } };
    return { d, fail: () => { fail = true; } };
  }
  it("reads partial import as incomplete then saved submitted answers as complete across shared readers", async () => {
    const { d } = database();
    const row = { id: "investment", offering_id: "fund", investment_profile_id: "profile", questionnaire_version: 1, questionnaire_submitted_at: "2026-11-04T21:53:00Z", questionnaire_responses: { [ACCREDITATION_QUESTION_KEY]: "Net worth over $1 million" } as Record<string, unknown> };
    expect((await questionnaireCompletionForRows(d, [row])).get(row.id)?.complete).toBe(false);
    row.questionnaire_responses = { name: "Example investor", confirm: true, fs_fact: "Saved fact" };
    expect((await questionnaireCompletionForRows(d, [row])).get(row.id)?.complete).toBe(true);
    delete row.questionnaire_responses["fs_fact"];
    expect((await questionnaireCompletionForRows(d, [row])).get(row.id)?.complete).toBe(false);
  });
  it("never treats a failed questionnaire read as an empty completed definition", async () => {
    const db = database();
    db.fail();
    await expect(loadCompletionQuestions(db.d, ["fund"])).rejects.toThrow("could not be loaded");
  });
});