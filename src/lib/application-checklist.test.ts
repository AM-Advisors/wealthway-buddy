import { describe, expect, it } from "vitest";
import { applicationChecklistSummary } from "@/lib/application-checklist";
import { journeySteps, type JourneyStepView } from "@/lib/investor-journey-model";
import type { RequirementResult } from "@/lib/investor-onboarding-model";

const facts = { stage: "signature", approvedToFund: false, fundingStatus: null, investorReportsSent: false };
const requirement = (key: RequirementResult["key"], state: RequirementResult["state"]): RequirementResult => ({ key, label: key, state, reason: "" });
const requirements: RequirementResult[] = [
  requirement("investment_profile", "valid"), requirement("investment_amount", "valid"),
  requirement("identity_verification", "valid"), requirement("aml", "valid"),
  requirement("tax_documentation", "valid"), requirement("subscription_documents", "valid"),
  requirement("signature", "valid"),
];

describe("application checklist shares investment completion", () => {
  it("approved verification stays complete without legacy application flags", () => {
    const journey = journeySteps(requirements, facts);
    expect(journey.find(s => s.key === "verify")?.state).toBe("complete");
    expect(applicationChecklistSummary(journey).remaining).toBe(1);
  });
  it("invalid current signature leaves Sign unfinished", () => {
    const journey = journeySteps(requirements.map(r => r.key === "signature" ? { ...r, state: "missing" as const } : r), facts);
    expect(journey.find(s => s.key === "sign")?.state).toBe("action_required");
    expect(applicationChecklistSummary(journey).remaining).toBe(2);
  });
  it("a valid reusable tax form adds no duplicate upload task", () => {
    expect(journeySteps(requirements, facts).find(s => s.key === "sign")?.state).toBe("complete");
    const missingTax = requirements.map(r => r.key === "tax_documentation" ? { ...r, state: "refresh_required" as const } : r);
    expect(applicationChecklistSummary(journeySteps(missingTax, facts)).remaining).toBe(2);
  });
  it("pending review is unfinished, not completed or a missing upload", () => {
    const journey = journeySteps(requirements.map(r => r.key === "identity_verification" ? { ...r, state: "review_required" as const } : r), facts);
    expect(journey.find(s => s.key === "verify")?.state).toBe("in_progress");
    expect(applicationChecklistSummary(journey).remaining).toBeGreaterThan(1);
  });
  it("counts all unfinished states consistently with the displayed steps", () => {
    const steps: JourneyStepView[] = [
      { key: "about", label: "About You", state: "complete", message: "" },
      { key: "verify", label: "Verification", state: "in_progress", message: "" },
      { key: "sign", label: "Sign", state: "action_required", message: "" },
      { key: "fund", label: "Fund", state: "locked", message: "" },
    ];
    expect(applicationChecklistSummary(steps).remaining).toBe(3);
    expect(applicationChecklistSummary(steps).complete).toBe(false);
    expect(applicationChecklistSummary(steps.map(s => ({ ...s, state: "complete" }))).complete).toBe(true);
  });
});
