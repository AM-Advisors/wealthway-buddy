import { describe, expect, it } from "vitest";
import { classifyLinkSession, countLinkStates, needsFollowUp } from "./fund-verification-link-model";

const now = new Date("2026-11-18T17:00:00Z");
const ev = (status: string, receivedAt: string) => ({ sessionId: "s", status, receivedAt });

describe("fund verification link sessions", () => {
  it("an approved session nobody on the fund holds needs adding", () => {
    expect(classifyLinkSession({ sessionId: "s", onFund: false, dismissed: false, events: [ev("Not Started", "2026-11-14T04:56:00Z"), ev("Approved", "2026-11-14T05:16:00Z")] }, now)).toBe("needs_adding");
  });
  it("an approved session later marked expired still needs adding", () => {
    expect(classifyLinkSession({ sessionId: "s", onFund: false, dismissed: false, events: [ev("Approved", "2026-11-14T05:16:00Z"), ev("Expired", "2026-11-16T05:16:00Z")] }, now)).toBe("needs_adding");
  });
  it("a session linked to an investor on the fund is on the fund", () => {
    expect(classifyLinkSession({ sessionId: "s", onFund: true, dismissed: false, events: [ev("Approved", "2026-11-14T05:16:00Z")] }, now)).toBe("on_fund");
  });
  it("an in-progress session within 7 days is still open; older ones are closed", () => {
    expect(classifyLinkSession({ sessionId: "s", onFund: false, dismissed: false, events: [ev("In Progress", "2026-11-13T22:51:00Z")] }, now)).toBe("in_progress");
    expect(classifyLinkSession({ sessionId: "s", onFund: false, dismissed: false, events: [ev("In Progress", "2026-11-01T22:51:00Z")] }, now)).toBe("closed");
  });
  it("staff can mark a finished session as not an investor", () => {
    expect(classifyLinkSession({ sessionId: "s", onFund: false, dismissed: true, events: [ev("Approved", "2026-11-14T05:16:00Z")] }, now)).toBe("not_investor");
  });
  it("only finished checks open a follow-up", () => {
    expect(needsFollowUp("Approved")).toBe(true);
    expect(needsFollowUp("In Review")).toBe(true);
    expect(needsFollowUp("Not Started")).toBe(false);
    expect(needsFollowUp("Expired")).toBe(false);
    expect(countLinkStates(["on_fund", "on_fund", "closed"]).on_fund).toBe(2);
  });
});
