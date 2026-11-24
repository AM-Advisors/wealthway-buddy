import { describe, expect, it } from "vitest";
import { investorOutstandingTasks } from "./investor-outstanding-tasks";
import type { JourneyStepView } from "./investor-journey-model";

const steps: JourneyStepView[] = [
  { key: "about", label: "About You", state: "complete", message: "" },
  { key: "verify", label: "Verification", state: "action_required", message: "" },
  { key: "sign", label: "Sign", state: "locked", message: "" },
  { key: "fund", label: "Fund", state: "locked", message: "" },
];
describe("outstanding tasks shared by home and notifications", () => {
  it("lists missing requirements once and omits completed and inapplicable work", () => {
    const tasks = investorOutstandingTasks([
      { key: "identity_verification", label: "Identity", state: "valid" },
      { key: "entity_verification", label: "Trust verification", state: "missing" },
      { key: "entity_verification", label: "Trust verification", state: "missing" },
      { key: "accreditation", label: "Accreditation", state: "not_applicable" },
    ], steps);
    expect(tasks.map((t) => t.key)).toEqual(["entity_verification"]);
    expect(tasks[0]?.actionable).toBe(true);
  });
  it("shows later requirements without opening a locked step", () => {
    const tasks = investorOutstandingTasks([{ key: "tax_documentation", label: "Tax form", state: "missing" }], steps);
    expect(tasks[0]?.step).toBe("sign");
    expect(tasks[0]?.actionable).toBe(false);
  });
  it("never asks the investor to sign again while awaiting countersignature", () => {
    const tasks = investorOutstandingTasks([{ key: "signature", label: "Signature", state: "review_required", awaitingCountersign: true }], steps);
    expect(tasks[0]?.actionable).toBe(false);
    expect(tasks[0]?.status).toBe("Waiting on fund countersignature");
  });
  it("keeps review work out of the investor action count", () => {
    expect(investorOutstandingTasks([{ key: "aml", label: "Screening", state: "review_required" }], steps)[0]?.actionable).toBe(false);
  });
});