import { describe, expect, it } from "vitest";
import { planClaim, fundInvestorsSummary, rosterOwner, PENDING_MATCH_MESSAGE } from "@/lib/investor-record-model";
import { investorHomeSummary, type JourneyStepView } from "@/lib/investor-journey-model";

const step = (key: any, state: any, message = key): JourneyStepView => ({ key, label: key, state, message });

describe("prepared-record claim plan", () => {
  it("links exactly one unclaimed prepared person when the account has none", () => {
    expect(planClaim({ emailVerified: true, unclaimedCandidateIds: ["p1"], ownPersonId: null })).toEqual({ kind: "link", personId: "p1" });
  });
  it("never links without a verified email", () => {
    expect(planClaim({ emailVerified: false, unclaimedCandidateIds: ["p1"], ownPersonId: null }).kind).toBe("none");
  });
  it("multiple candidates go to Harmonious review, never merged", () => {
    expect(planClaim({ emailVerified: true, unclaimedCandidateIds: ["p1", "p2"], ownPersonId: null })).toEqual({ kind: "review", candidateIds: ["p1", "p2"] });
  });
  it("an account that already has a person goes to review instead of creating a second person link", () => {
    expect(planClaim({ emailVerified: true, unclaimedCandidateIds: ["p1"], ownPersonId: "own" }).kind).toBe("review");
  });
  it("the investor message names no candidate records", () => {
    expect(PENDING_MATCH_MESSAGE.body).toMatch(/don't need to create another investment/);
    expect(JSON.stringify(PENDING_MATCH_MESSAGE)).not.toMatch(/p1|person|email/i);
  });
});

describe("investor home summary", () => {
  it("shows the next action when the investor has something to do", () => {
    const h = investorHomeSummary([step("about", "complete"), step("verify", "action_required", "Start verification to continue."), step("sign", "locked"), step("fund", "locked")]);
    expect(h).toMatchObject({ caughtUp: false, nextStep: "verify", nextAction: "Start verification to continue.", progressPercent: 25 });
  });
  it("says caught up and what it waits on when nothing is on the investor", () => {
    const steps = [step("about", "complete"), step("verify", "complete"), step("sign", "complete"), step("fund", "locked")];
    expect(investorHomeSummary(steps).waitingOn).toBe("Harmonious is reviewing your information.");
    expect(investorHomeSummary(steps, { waitingOnManager: true }).waitingOn).toBe("Waiting for the Fund Manager.");
  });
  it("complete when every step is done", () => {
    expect(investorHomeSummary(["about", "verify", "sign", "fund"].map((k) => step(k, "complete"))).complete).toBe(true);
  });
});

describe("manager roster owner and summary", () => {
  const row = (id: string, owner: string | null, extra: any = {}) => ({ onboardingId: id, closeReady: false, readiness: { items: [] }, nextAction: owner ? { owner } : null, ...extra });
  it("maps the readiness owner to client wording", () => {
    expect(rosterOwner(row("a", "investor"))).toBe("Investor");
    expect(rosterOwner(row("a", "harmonious"))).toBe("Harmonious");
    expect(rosterOwner(row("a", "fund_manager"))).toBe("Fund Manager");
    expect(rosterOwner({ ...row("a", "investor"), closeReady: true })).toBe("-");
  });
  it("splits Needs Investor and Needs Harmonious from the same readiness rows", () => {
    const s = fundInvestorsSummary(["a", "b", "c"], [row("a", "investor"), row("b", "harmonious"), { ...row("c", null), closeReady: true }], 2);
    expect(s).toMatchObject({ total: 3, invited: 2, needsInvestor: 1, needsHarmonious: 1, ready: 1, onboarding: 2 });
  });
});
