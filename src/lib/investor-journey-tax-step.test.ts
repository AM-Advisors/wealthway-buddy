import { describe, expect, it } from "vitest";
import { journeySteps, verificationSummary } from "./investor-journey-model";

const r = (key: string, state: string) => ({ key, state, label: key }) as any;
const reqs = [
  r("account", "valid"), r("investment_profile", "valid"), r("investment_amount", "valid"),
  r("identity_verification", "valid"), r("aml", "valid"), r("eligibility", "valid"),
  r("tax_documentation", "missing"), r("subscription_questionnaire", "missing"),
  r("subscription_documents", "missing"), r("signature", "missing"), r("funding", "missing"),
];

describe("cleared investor with tax questions still open", () => {
  it("completes Verification once identity and screening are clear", () => {
    expect(verificationSummary(reqs)).toBe("complete");
  });
  it("opens Sign so the tax questions can be answered", () => {
    const steps = journeySteps(reqs, { approvedToFund: false, fundingStatus: null } as any);
    expect(steps.find((s: any) => s.key === "sign")?.state).toBe("action_required");
  });
});
