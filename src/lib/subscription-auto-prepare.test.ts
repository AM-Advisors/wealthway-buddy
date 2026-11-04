import { describe, expect, it } from "vitest";
import { shouldAutoPrepareSubscription } from "./subscription-auto-prepare";
import type { RequirementResult } from "./investor-onboarding-model";

const requirements: RequirementResult[] = [
  { key: "identity_verification", label: "Identity", state: "valid" },
  { key: "aml", label: "Screening", state: "valid" },
  { key: "subscription_questionnaire", label: "Questionnaire", state: "valid" },
  { key: "tax_documentation", label: "Tax", state: "valid" },
  { key: "subscription_documents", label: "Documents", state: "missing" },
  { key: "signature", label: "Signature", state: "missing" },
];
const ready = { stage: "signature", removed: false, prepared: false, hasInvestor: true, blockingExceptions: 0, requirements };

describe("subscription preparation before the investor opens documents", () => {
  it("prepares immediately after the final prerequisite completes", () => {
    expect(shouldAutoPrepareSubscription(ready)).toBe(true);
    expect(shouldAutoPrepareSubscription({ ...ready, requirements: requirements.map(r => r.key === "tax_documentation" ? { ...r, state: "missing" } : r) })).toBe(false);
  });
  it("does not require an investor or staff preparation action", () => {
    expect(shouldAutoPrepareSubscription({ ...ready, stage: "verification" })).toBe(true);
  });
  it("retains prepared and signed packages", () => {
    expect(shouldAutoPrepareSubscription({ ...ready, prepared: true })).toBe(false);
    expect(shouldAutoPrepareSubscription({ ...ready, stage: "harmonious_review" })).toBe(false);
  });
  it("retains removed, terminal and blocking-review boundaries", () => {
    expect(shouldAutoPrepareSubscription({ ...ready, removed: true })).toBe(false);
    expect(shouldAutoPrepareSubscription({ ...ready, stage: "declined" })).toBe(false);
    expect(shouldAutoPrepareSubscription({ ...ready, blockingExceptions: 1 })).toBe(false);
    expect(shouldAutoPrepareSubscription({ ...ready, hasInvestor: false })).toBe(false);
  });
  it("permits only explicitly sign-allowed accreditation review", () => {
    const accreditation: RequirementResult = { key: "accreditation", label: "Accreditation", state: "review_required", signingAllowed: true };
    expect(shouldAutoPrepareSubscription({ ...ready, requirements: [...requirements, accreditation] })).toBe(true);
    expect(shouldAutoPrepareSubscription({ ...ready, requirements: [...requirements, { ...accreditation, signingAllowed: false }] })).toBe(false);
  });
});