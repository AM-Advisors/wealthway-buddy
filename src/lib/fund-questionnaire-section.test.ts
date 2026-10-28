import { describe, it, expect } from "vitest";
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
