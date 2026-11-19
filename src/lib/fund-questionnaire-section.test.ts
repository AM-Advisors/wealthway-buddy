import { describe, it, expect } from "vitest";
import { questionnaireCompletion } from "./questionnaire-completion";
import { mergeSection, newSectionQuestions, validateSectionQuestions } from "./fund-questionnaire-section";
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
