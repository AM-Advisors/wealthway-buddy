import { describe, expect, it } from "vitest";
import { linkedInvestorRecords } from "./linked-investor-navigation";

describe("explicit legacy investor navigation", () => {
  const linked = { onboardingId: "onboarding-1", applicationId: "application-1", offeringId: "fund-1" };
  it("uses the explicitly linked onboarding in the current fund", () => {
    expect(linkedInvestorRecords("fund-1", [linked]).get("application-1")?.onboardingId).toBe("onboarding-1");
  });
  it("keeps unlinked legacy applications on their existing destination", () => {
    expect(linkedInvestorRecords("fund-1", [linked]).has("application-2")).toBe(false);
  });
  it("does not infer links from the same account, name or email", () => {
    const samePerson = { ...linked, applicationId: null, name: "Casey Alden", email: "casey@example.test", investorUserId: "user-1" };
    expect(linkedInvestorRecords("fund-1", [samePerson]).size).toBe(0);
  });
  it("rejects links belonging to another fund", () => {
    expect(linkedInvestorRecords("fund-2", [linked]).size).toBe(0);
  });
  it("does not guess when an application has multiple onboardings", () => {
    expect(linkedInvestorRecords("fund-1", [linked, { ...linked, onboardingId: "onboarding-2" }]).has("application-1")).toBe(false);
  });
  it("allows several distinct applications for the same fund", () => {
    const result = linkedInvestorRecords("fund-1", [linked, { ...linked, applicationId: "application-2", onboardingId: "onboarding-2" }]);
    expect([...result.values()].map((r) => r.onboardingId)).toEqual(["onboarding-1", "onboarding-2"]);
  });
  it("keeps all legacy destinations when canonical records are unavailable", () => {
    expect(linkedInvestorRecords("fund-1", []).size).toBe(0);
  });
  it("requires a recorded fund and a nonempty application link", () => {
    const records = [
      { ...linked, offeringId: null },
      { onboardingId: linked.onboardingId, applicationId: linked.applicationId },
      { ...linked, applicationId: "" },
    ];
    expect(linkedInvestorRecords("fund-1", records).size).toBe(0);
  });
  it("does not let another fund's application link replace the current fund's destination", () => {
    const foreign = { ...linked, offeringId: "fund-2", onboardingId: "foreign-onboarding" };
    for (const records of [[foreign, linked], [linked, foreign]]) {
      expect(linkedInvestorRecords("fund-1", records).get("application-1")?.onboardingId).toBe("onboarding-1");
    }
  });
  it("keeps an ambiguous application excluded after further candidates without affecting unique applications", () => {
    const records = [linked, { ...linked, onboardingId: "onboarding-2" },
      { ...linked, onboardingId: "onboarding-3" },
      { ...linked, applicationId: "application-2", onboardingId: "unique-onboarding" }];
    for (const candidates of [records, [...records].reverse()]) {
      const result = linkedInvestorRecords("fund-1", candidates);
      expect(result.has("application-1")).toBe(false);
      expect(result.get("application-2")?.onboardingId).toBe("unique-onboarding");
      expect(result.size).toBe(1);
    }
  });
});