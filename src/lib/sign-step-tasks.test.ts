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
    expect(t.map((x) => x.key)).toEqual(["subscription_questionnaire", "accreditation", "tax_documentation", "certifications", "fees", "subscription_documents", "submit"]);
    expect(t.find(x => x.key === "subscription_questionnaire")?.state).toBe("todo");
  });

  it("locks documents until questionnaire and tax form are done", () => {
    const t = buildSignTasks({ ...base, requirements: [{ key: "subscription_questionnaire", state: "missing" }, { key: "tax_documentation", state: "missing" }] });
    expect(t.find((x) => x.key === "subscription_documents")!.state).toBe("locked");
    expect(t.find((x) => x.key === "tax_documentation")!.state).toBe("locked");
  });

  it("keeps documents locked until accreditation is chosen", () => {
    const t = buildSignTasks({ ...base, requirements: [{ key: "subscription_questionnaire", state: "valid" }, { key: "accreditation", state: "missing" }] });
    expect(t.find((x) => x.key === "accreditation")!.state).toBe("todo");
    expect(t.find((x) => x.key === "subscription_documents")!.state).toBe("locked");
    expect(t.find((x) => x.key === "submit")!.state).toBe("locked");
  });

  it("lets signing and preparation continue while accreditation is under review", () => {
    const t = buildSignTasks({ ...base, requirements: [{ key: "subscription_questionnaire", state: "valid" }, { key: "accreditation", state: "review_required" }] });
    expect(t.find((x) => x.key === "accreditation")!.state).toBe("review");
    expect(t.find((x) => x.key === "subscription_documents")!.state).toBe("todo");
  });

  it("keeps documents locked until certifications are done", () => {
    const t = buildSignTasks({ ...base, requirements: [{ key: "certifications", state: "missing" }] });
    expect(t.find((x) => x.key === "subscription_documents")!.state).toBe("locked");
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
  it("omits inapplicable BSA and routes applicable work to the questionnaire", () => {
    const requirements = [{ key: "bsa_aml", state: "not_applicable" }];
    expect(buildSignTasks({ ...base, hasQuestionnaire: false, requirements }).some(t => t.key === "subscription_questionnaire")).toBe(false);
    const tasks = buildSignTasks({ ...base, hasQuestionnaire: false, requirements: [{ key: "bsa_aml", state: "missing" }] });
    expect(tasks.find(t => t.key === "subscription_questionnaire")?.state).toBe("todo");
    expect(taskForError("Financial background must be completed first.", tasks)).toBe("subscription_questionnaire");
  });
  it("keeps financial review without relocking completed tax intake", () => {
    const tasks = buildSignTasks({ ...base, requirements: [{ key: "subscription_questionnaire", state: "valid" }, { key: "bsa_aml", state: "review_required" }, { key: "tax_documentation", state: "missing" }] });
    expect(tasks.find(t => t.key === "subscription_questionnaire")?.state).toBe("review");
    expect(tasks.find(t => t.key === "tax_documentation")?.state).toBe("todo");
    expect(tasks.find(t => t.key === "submit")?.state).toBe("locked");
  });
});
