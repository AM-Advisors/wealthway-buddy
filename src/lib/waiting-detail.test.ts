import { describe, it, expect } from "vitest";
import { actionText, waitingDetail } from "./readiness-presentation";
const q = { key: "subscription_questionnaire", status: "complete" };
describe("waiting detail", () => {
  it("tax questions after submitted questionnaire say questionnaire is complete", () => {
    const i = { key: "tax_classification", status: "needs_investor", action: "Complete tax questions" };
    expect(actionText(i, [q, i])).toBe("Confirm tax status on the tax form");
    expect(waitingDetail(i, [q, i])).toMatch(/^Questionnaire is complete/);
  });
  it("prepare documents waits on tax form", () => {
    const i = { key: "signature_docs", status: "needs_harmonious", action: "Prepare subscription documents" };
    expect(waitingDetail(i, [i])).toBe("Prepares automatically once the tax form is signed");
  });
  it("complete items have no detail", () => {
    expect(waitingDetail({ key: "funding", status: "complete" }, [])).toBeNull();
  });
});
