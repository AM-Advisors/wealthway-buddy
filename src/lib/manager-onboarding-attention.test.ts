import { describe, expect, it } from "vitest";
import { isOpenOnboardingStage, onboardingInvestorName, onboardingWaitingStatus } from "./manager-onboarding-attention";

describe("manager onboarding attention cards", () => {
  it("names the investing party before the person", () => {
    expect(onboardingInvestorName({ legal_name: "ABC Capital Trust" }, { legal_first_name: "Calvin", legal_last_name: "French" })).toBe("ABC Capital Trust");
  });
  it("uses the person's name when there is no investing party yet", () => {
    expect(onboardingInvestorName(null, { legal_first_name: "Calvin", legal_last_name: "French" })).toBe("Calvin French");
  });
  it("falls back to the invited email, never the word Investor", () => {
    expect(onboardingInvestorName(null, { email: "calvin@example.com" })).toBe("calvin@example.com");
    expect(onboardingInvestorName(null, null)).toBe("Unnamed investor");
  });
  it("leaves cancelled and declined investors off the waiting list", () => {
    expect(isOpenOnboardingStage("cancelled")).toBe(false);
    expect(isOpenOnboardingStage("declined")).toBe(false);
    expect(isOpenOnboardingStage("closed")).toBe(false);
    expect(isOpenOnboardingStage("verification")).toBe(true);
  });
  it("names the step in plain words", () => {
    expect(onboardingWaitingStatus("verification")).toBe("Waiting on the investor to finish the ID check");
    expect(onboardingWaitingStatus("signature")).toBe("Waiting on the investor to sign the subscription documents");
  });
});
