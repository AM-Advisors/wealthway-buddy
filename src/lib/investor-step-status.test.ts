import { describe, expect, it } from "vitest";
import { currentStep, investorSteps } from "./investor-step-status";

const base = { stage: "started", claimed: false, profileChosen: false, questionnaireDone: false, kyc: "not_started", aml: "not_started", signed: false, outForSignature: false, funding: "not_ready" };

describe("investorSteps", () => {
  it("has exactly About You, Verification, Sign, Fund in order", () => expect(investorSteps(base).map((s) => s.label)).toEqual(["About You", "Verification", "Sign", "Fund"]));
  it("a declined identity check needs attention", () => expect(investorSteps({ ...base, kyc: "declined" })[1]!.state).toBe("blocked"));
  it("in-review identity check sits with Harmonious", () => expect(investorSteps({ ...base, kyc: "in_review" })[1]!.state).toBe("waiting_harmonious"));
  it("fund is complete only when reconciled", () => {
    expect(investorSteps({ ...base, funding: "pending_reconciliation" })[3]!.state).toBe("waiting_harmonious");
    expect(investorSteps({ ...base, funding: "funded" })[3]!.state).toBe("complete");
  });
  it("current step is the first not complete", () => expect(currentStep(investorSteps({ ...base, profileChosen: true, questionnaireDone: true }))!.label).toBe("Verification"));
});
