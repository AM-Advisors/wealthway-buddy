import { describe, it, expect } from "vitest";
import { questionnaireCompletion } from "./questionnaire-completion";
import { carryNewInvestmentCutoffs, mergeSection, newSectionQuestions, validateSectionQuestions } from "./fund-questionnaire-section";
const base = [{ key: "email", label: "Email", type: "text" as const }, { key: "phone", label: "Phone", type: "text" as const }];
describe("fund questionnaire section", () => {
  it("never asks a question twice by key or wording", () => {
    const out = newSectionQuestions(base as any, [
      { key: "fs_email", label: "Email (required)", type: "text" },
      { key: "fs_sof", label: "Source of funds", type: "text" },
      { key: "fs_sof2", label: "Source of Funds", type: "text" },
    ] as any);
    expect(out.map((q) => q.key)).toEqual(["fs_sof"]);
  });
  it("appends new questions after the base questionnaire", () => {
    const m = mergeSection({ questions: base } as any, { title: "ROAS", version: 2, questions: [{ key: "fs_us", label: "U.S. person?", type: "select", options: ["Yes", "No"] }] as any });
    expect(m.questions!.map((q: any) => q.key)).toEqual(["email", "phone", "fs_us"]);
    expect(m.sectionVersion).toBe(2);
  });
  it("rejects keys without the section prefix and selects without choices", () => {
    expect(validateSectionQuestions([{ key: "x", label: "A", type: "text" }] as any)).toMatch(/fs_/);
    expect(validateSectionQuestions([{ key: "fs_a", label: "A", type: "select" }] as any)).toMatch(/choices/);
  });
});

describe("new investors only fund questions", () => {
  const base = { questions: [{ key: "name", label: "Name", type: "text" as const, required: true }] };
  const section = { title: "Qualified status", version: 1, approvedAt: "2026-11-19T04:00:00Z", newInvestmentsOnly: true, questions: [{ key: "fs_qc", label: "Qualified client status", type: "select" as const, required: true, options: ["Yes", "No"] }] };
  it("investments started before publication are not asked", () => {
    expect(mergeSection(base, section, "2026-10-01T00:00:00Z").questions.map((q) => q.key)).toEqual(["name"]);
  });
  it("investments started after publication must answer", () => {
    expect(mergeSection(base, section, "2026-11-20T00:00:00Z").questions.map((q) => q.key)).toEqual(["name", "fs_qc"]);
  });
  it("completion ignores the new questions for earlier investments but requires them for new ones", () => {
    const qs = mergeSection(base, section).questions;
    const answers = { name: "A" };
    expect(questionnaireCompletion({ submittedAt: "x", version: 1, questions: qs, answers, startedAt: "2026-10-01T00:00:00Z" }).complete).toBe(true);
    expect(questionnaireCompletion({ submittedAt: "x", version: 1, questions: qs, answers, startedAt: "2026-11-20T00:00:00Z" }).complete).toBe(false);
  });
  it("sections without the setting still apply to everyone", () => {
    expect(mergeSection(base, { ...section, newInvestmentsOnly: false }, "2026-10-01T00:00:00Z").questions).toHaveLength(2);
  });
});

describe("later versions of new-investor questions", () => {
  const base = { questions: [{ key: "name", label: "Name", type: "text" as const, required: true }] };
  const v1 = { questions: [{ key: "fs_qc", label: "Qualified client status", type: "text" as const, required: true }], approvedAt: "2026-11-19T03:42:00Z", newInvestmentsOnly: true };
  const v2Draft = [...v1.questions, { key: "fs_ira", label: "IRA custodian", type: "text" as const, required: true }];
  it("questions carried from version 1 keep version 1's start time; new ones start at version 2", () => {
    const carried = carryNewInvestmentCutoffs(v1, v2Draft as any, true);
    const v2 = { title: "Corps Cap", version: 2, approvedAt: "2026-11-19T05:00:00Z", newInvestmentsOnly: true, questions: carried };
    // Investment started between version 1 and version 2: still asked version 1's question, not the new one.
    expect(mergeSection(base, v2, "2026-11-19T04:00:00Z").questions.map((q) => q.key)).toEqual(["name", "fs_qc"]);
    // Investment started before version 1: asked neither.
    expect(mergeSection(base, v2, "2026-11-01T00:00:00Z").questions.map((q) => q.key)).toEqual(["name"]);
    // Investment started after version 2: asked both.
    expect(mergeSection(base, v2, "2026-11-20T00:00:00Z").questions.map((q) => q.key)).toEqual(["name", "fs_qc", "fs_ira"]);
  });
  it("a draft cannot supply its own earlier start time", () => {
    const sneaky = [{ key: "fs_new", label: "New", type: "text" as const, newInvestmentsFrom: "2020-01-01T00:00:00Z" }];
    expect(carryNewInvestmentCutoffs(v1, sneaky as any, true)[0]?.newInvestmentsFrom).toBeUndefined();
  });
});
