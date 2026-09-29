import { describe, expect, it } from "vitest";
import {
  agreementCounts, bucketOf, capital, clientStepIndex, fundingStateOf, funnel, funnelStageOf, isFunded, kpis,
  managerBucketOf, managerReadiness, readinessDistribution, trend, type InvestmentFact,
} from "@/lib/dashboard-metrics";

const f = (p: Partial<InvestmentFact> & { r?: any }): InvestmentFact => ({
  onboardingId: p.onboardingId ?? Math.random().toString(36), offeringId: p.offeringId ?? "A", fundingStatus: p.fundingStatus ?? "not_funded",
  stage: p.stage ?? "in_progress", intendedCents: p.intendedCents ?? 1000, approved: p.approved ?? false, readiness: p.r ?? { currentStage: "identity", items: [], nextAction: { label: "x", owner: "investor" } },
});

describe("dashboard metrics", () => {
  it("funded requires reconciliation; reported wire is not funded", () => {
    expect(isFunded(f({ fundingStatus: "investor_reports_sent" }))).toBe(false);
    expect(isFunded(f({ fundingStatus: "funded" }))).toBe(true);
    const c = capital([f({ fundingStatus: "investor_reports_sent", approved: true }), f({ fundingStatus: "funded", intendedCents: 500 })]);
    expect(c).toEqual({ intendedCents: 1000, awaitingFundingCents: 1000, fundedCents: 500 });
    expect(fundingStateOf(f({ fundingStatus: "investor_reports_sent", approved: true }))).toBe("funding_pending");
    expect(fundingStateOf(f({ approved: false }))).toBe("not_ready");
  });

  it("funnel maps readiness stages to the four client steps and counts invites", () => {
    const facts = [f({ r: { currentStage: "investment_profile" } }), f({ r: { currentStage: "tax" } }), f({ r: { currentStage: "subscription" } }), f({ r: { currentStage: "funding" } }), f({ fundingStatus: "funded" })];
    const rows = funnel(facts, 2);
    expect(rows.map((r) => r.count)).toEqual([2, 1, 1, 1, 1, 1]);
    expect(rows.reduce((s, r) => s + (r.percent ?? 0), 0)).toBeGreaterThan(95);
    expect(clientStepIndex(facts[2]!)).toBe(2);
  });

  it("readiness buckets derive from the engine result", () => {
    expect(bucketOf(f({ r: { closeReady: true } }))).toBe("ready");
    expect(bucketOf(f({ r: { items: [{ status: "blocked", owner: "harmonious" }] } }))).toBe("blocked");
    expect(bucketOf(f({ r: { nextAction: { label: "", owner: "fund_manager" } } }))).toBe("needs_fund_manager");
    expect(bucketOf(f({ r: { items: [{ status: "under_review", owner: "harmonious" }], nextAction: { label: "", owner: "harmonious" } } }))).toBe("under_review");
    expect(bucketOf(f({ r: { terminal: "declined" } }))).toBeNull();
    expect(managerBucketOf(f({ r: { items: [{ status: "blocked", owner: "fund_manager" }] } }))).toBe("needs_me");
  });

  it("kpis, distribution and manager view agree", () => {
    const facts = [f({ r: { closeReady: true } }), f({}), f({ r: { nextAction: { label: "", owner: "harmonious" } } })];
    const k = kpis(facts);
    expect(k).toMatchObject({ investors: 3, ready: 1, onboarding: 2, needsInvestor: 1, needsHarmonious: 1 });
    expect(readinessDistribution(facts).find((r) => r.key === "ready")!.count).toBe(k.ready);
    expect(managerReadiness(facts).find((r) => r.key === "needs_harmonious")!.count).toBe(1);
  });

  it("drill-down filter uses the same function as the count", () => {
    const facts = [f({ r: { currentStage: "tax" } }), f({ r: { currentStage: "identity" } }), f({ r: { currentStage: "subscription" } })];
    const count = funnel(facts, 0).find((r) => r.key === "verification")!.count;
    expect(facts.filter((x) => funnelStageOf(x) === "verification").length).toBe(count);
  });

  it("cross-fund facts never mix when filtered by fund", () => {
    const facts = [f({ offeringId: "A" }), f({ offeringId: "B" }), f({ offeringId: "B" })];
    expect(kpis(facts.filter((x) => x.offeringId === "A")).investors).toBe(1);
  });

  it("agreement counts treat unknown as setup needs review", () => {
    expect(agreementCounts(["complete", "follow_up", null, "needs_review"])).toEqual({ complete: 1, follow_up: 1, needs_review: 2 });
  });

  it("trend uses only real history and returns null when insufficient", () => {
    const now = Date.parse("2026-09-29T00:00:00Z");
    expect(trend([], [], "30d", now)).toBeNull();
    expect(trend(["2026-09-20T00:00:00Z"], [], "30d", now)).toBeNull();
    expect(trend(["2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z"], [], "30d", now)).toBeNull();
    const t = trend(["2026-09-20T00:00:00Z", "2026-09-20T05:00:00Z"], ["2026-09-21T00:00:00Z"], "30d", now)!;
    expect(t).toEqual([{ bucket: "2026-09-20", started: 2, completed: 0 }, { bucket: "2026-09-21", started: 0, completed: 1 }]);
  });

  it("empty input yields zero counts with null percentages (distinguishable from data)", () => {
    expect(readinessDistribution([]).every((r) => r.count === 0 && r.percent === null)).toBe(true);
  });
});
