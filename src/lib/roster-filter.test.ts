import { describe, it, expect } from "vitest";
import { rosterFilterMatches, rosterProgress, fundInvestorsSummary, rosterNextLabel } from "@/lib/investor-record-model";

const row = (owner: string, items: { key: string; status: string }[], closeReady = false) => ({ onboardingId: owner + items.length, closeReady, nextAction: { owner }, readiness: { items, terminal: false } }) as any;

describe("investor roster filter boxes", () => {
  const waitingInvestor = row("investor", [{ key: "about", status: "complete" }, { key: "sign", status: "pending" }]);
  const waitingStaff = row("harmonious", [{ key: "about", status: "complete" }, { key: "aml", status: "pending" }]);
  it("each box shows the same rows it counts", () => {
    const s = fundInvestorsSummary([waitingInvestor.onboardingId, waitingStaff.onboardingId], [waitingInvestor, waitingStaff], 2);
    expect(s.needsInvestor).toBe(1);
    expect(s.needsHarmonious).toBe(1);
    expect(rosterFilterMatches("investor", waitingInvestor)).toBe(true);
    expect(rosterFilterMatches("investor", waitingStaff)).toBe(false);
    expect(rosterFilterMatches("harmonious", waitingStaff)).toBe(true);
    expect(rosterFilterMatches("all", waitingStaff)).toBe(true);
  });
  it("Waiting on investor box includes invitations", () => {
    const s = fundInvestorsSummary([], [], 3);
    expect(s.needsInvestor + s.invited).toBe(3);
  });
  it("funded investors fall under Ready or funded", () => {
    expect(rosterFilterMatches("done", row("investor", [{ key: "funding", status: "complete" }]))).toBe(true);
  });
  it("progress counts completed steps", () => {
    expect(rosterProgress(waitingInvestor)).toEqual({ done: 1, total: 2 });
  });
  it("an unfinished step with nobody assigned is never shown as No action needed", () => {
    const stalled = { onboardingId: "c", closeReady: false, nextAction: null, readiness: { terminal: null, items: [{ key: "subscription_documents", status: "in_progress" }], stages: [{ title: "Tax", status: "complete" }, { title: "Subscription Documents", status: "in_progress" }] } } as any;
    expect(rosterNextLabel(stalled)).toBe("Needs follow-up: Subscription Documents not finished");
  });
  it("No action needed only when nothing is left", () => {
    expect(rosterNextLabel({ onboardingId: "r", closeReady: true, nextAction: null, readiness: { items: [] } } as any)).toBe("No action needed");
    expect(rosterNextLabel({ onboardingId: "n", closeReady: false, nextAction: { label: "Sign subscription documents" }, readiness: { items: [] } } as any)).toBe("Sign subscription documents");
  });
});
