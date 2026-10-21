import { describe, expect, it } from "vitest";
import { buildSignTasks, taskForError } from "./sign-step-tasks";

const base = {
  hasQuestionnaire: true,
  documents: [{ requiresSignature: true, signed: false }],
  feesRequired: true,
  feesAccepted: true,
  submitted: false,
};

describe("sign step tasks", () => {
  it("keeps the fixed order", () => {
    const t = buildSignTasks({ ...base, requirements: [
      { key: "subscription_questionnaire", state: "valid" }, { key: "accreditation", state: "valid" },
      { key: "bsa_aml", state: "missing" }, { key: "tax_documentation", state: "valid" }, { key: "certifications", state: "missing" },
    ] });
    expect(t.map((x) => x.key)).toEqual(["subscription_questionnaire", "accreditation", "bsa_aml", "tax_documentation", "certifications", "fees", "subscription_documents", "submit"]);
  });

  it("locks documents until questionnaire and tax form are done", () => {
    const t = buildSignTasks({ ...base, requirements: [{ key: "subscription_questionnaire", state: "missing" }, { key: "tax_documentation", state: "missing" }] });
    expect(t.find((x) => x.key === "subscription_documents")!.state).toBe("locked");
    expect(t.find((x) => x.key === "tax_documentation")!.state).toBe("locked");
  });

  it("blocks submit while financial background is missing even with documents signed", () => {
    const t = buildSignTasks({ ...base, documents: [{ requiresSignature: true, signed: true }], requirements: [
      { key: "subscription_questionnaire", state: "valid" }, { key: "tax_documentation", state: "valid" }, { key: "bsa_aml", state: "missing" },
    ] });
    expect(t.find((x) => x.key === "submit")!.state).toBe("locked");
  });

  it("opens submit when everything is done", () => {
    const t = buildSignTasks({ ...base, documents: [{ requiresSignature: true, signed: true }], requirements: [
      { key: "subscription_questionnaire", state: "valid" }, { key: "tax_documentation", state: "valid" }, { key: "certifications", state: "valid" },
    ] });
    expect(t.find((x) => x.key === "submit")!.state).toBe("todo");
  });

  it("maps the server error to Review & certify", () => {
    const t = buildSignTasks({ ...base, requirements: [{ key: "certifications", state: "missing" }] });
    expect(taskForError("Review & certify must be completed first.", t)).toBe("certifications");
  });
});
