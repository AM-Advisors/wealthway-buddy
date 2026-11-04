import { describe, expect, it } from "vitest";
import { investorCheckRows } from "@/lib/ops-records";

describe("Investor 360 canonical investment projection", () => {
  const rows = [
    { id: "individual", offering_id: "b", investment_profile_id: "person", stage: "signature" },
    { id: "trust", offering_id: "c", investment_profile_id: "entity", stage: "verification" },
  ];
  it("keeps individual and trust eligibility separate without legacy applications", () => {
    const checks = investorCheckRows(rows, [
      { stages: [{ stage: "identity", status: "complete" }, { stage: "eligibility", status: "complete" }], nextAction: { label: "Complete tax form" } },
      { stages: [{ stage: "identity", status: "under_review" }, { stage: "eligibility", status: "needs_investor" }], nextAction: { label: "Provide accreditation information" } },
    ], new Map([["b", "Fund B"], ["c", "Fund C"]]), new Map([["person", "Person"], ["entity", "Trust"]]));
    expect(checks[0]).toMatchObject({ onboardingId: "individual", identity: "complete", eligibility: "complete", profileLabel: "Person" });
    expect(checks[1]).toMatchObject({ onboardingId: "trust", identity: "under_review", eligibility: "needs_investor", profileLabel: "Trust" });
  });
  it("does not fabricate completed checks when readiness is missing", () => {
    const checks = investorCheckRows(rows, [], new Map(), new Map());
    expect(checks.map((c) => c.identity)).toEqual([null, null]);
    expect(checks.map((c) => c.eligibility)).toEqual([null, null]);
  });
  it("keeps nonapplicable accreditation nonapplicable rather than not started", () => {
    const checks = investorCheckRows(rows.slice(0, 1), [{ stages: [{ stage: "eligibility", status: "not_applicable" }], nextAction: null }], new Map(), new Map());
    expect(checks[0]?.eligibility).toBe("not_applicable");
  });
});