import { describe, expect, it } from "vitest";
import { attentionLines, fundMetrics, matchesFilter, rosterSummary, totals, type FundOnboardingFact } from "@/lib/ops-funds-model";
import { computeReadiness } from "@/lib/investment-readiness";

const A = "fund-a", B = "fund-b";
const f = (o: Partial<FundOnboardingFact>): FundOnboardingFact => ({ offeringId: A, stage: "verification", closeReady: false, terminal: null, blocked: false, nextOwner: "investor", fundingStatus: null, ...o });

describe("Operations fund metrics", () => {
  const facts = [
    f({}), f({ nextOwner: "harmonious" }), f({ blocked: true, nextOwner: "harmonious" }), f({ closeReady: true, fundingStatus: "funded" }),
    f({ stage: "closed", terminal: "closed", fundingStatus: "funded" }), f({ offeringId: B, nextOwner: "harmonious" }),
  ];
  it("derive from canonical readiness facts and stay fund-scoped", () => {
    const m = fundMetrics(A, facts, []);
    expect(m).toMatchObject({ investors: 5, onboarding: 3, ready: 1, needsHarmonious: 1, blocked: 1, funded: 2, waitingInvestor: 1 });
    expect(fundMetrics(B, facts, []).investors).toBe(1);
    expect(fundMetrics("fund-x", facts, []).investors).toBe(0);
  });
  it("open Harmonious work items raise attention without inventing fields", () => {
    expect(fundMetrics(A, [], [{ offeringId: A, owner: "harmonious" }, { offeringId: B, owner: "harmonious" }, { offeringId: A, owner: "investor" }]).needsAttention).toBe(1);
  });
  it("totals and attention lines", () => {
    const rows = [{ isOpen: true, metrics: fundMetrics(A, facts, []) }, { isOpen: false, metrics: fundMetrics(B, facts, []) }];
    expect(totals(rows)).toEqual({ activeFunds: 1, onboarding: 4, ready: 1, needsHarmonious: 2, blocked: 1 });
    expect(attentionLines(rows[0]!.metrics)).toEqual(["1 investor blocked", "1 investor needs Harmonious review", "1 investor ready for close"]);
  });
  it("closing soon is an explicit date window only", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    const m = fundMetrics(A, [], []);
    expect(matchesFilter({ isOpen: true, targetClose: null, metrics: m }, "closing_soon", 30, now)).toBe(false);
    expect(matchesFilter({ isOpen: true, targetClose: "2026-10-15", metrics: m }, "closing_soon", 30, now)).toBe(true);
    expect(matchesFilter({ isOpen: true, targetClose: "2027-01-15", metrics: m }, "closing_soon", 30, now)).toBe(false);
  });
});

describe("Investors tab summary uses the canonical engine", () => {
  it("counts from computeReadiness output, not a separate status", () => {
    const r = computeReadiness({ requirements: [], stage: "verification", fundingStatus: "not_funded", approvedToFundAt: null, acceptedAt: null, acceptedAmountCents: null, closedAt: null, exceptions: [] });
    const s = rosterSummary([{ closeReady: r.closeReady, readiness: r }]);
    expect(s.total).toBe(1);
    expect(s.ready + s.onboarding).toBe(1);
    expect(s.funded).toBe(0);
  });
});
