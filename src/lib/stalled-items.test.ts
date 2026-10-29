import { describe, expect, it } from "vitest";
import { daysWaiting, isStalled, waitingLabel, STALL_DAYS } from "./stalled-items";
const now = new Date("2026-10-29T12:00:00Z");
describe("stalled items", () => {
  it("counts whole days waiting", () => expect(daysWaiting("2026-10-26T11:00:00Z", now)).toBe(3));
  it("flags a ready-to-launch fund after 3 days", () => expect(isStalled("2026-10-26T11:00:00Z", now, STALL_DAYS.launchReady)).toBe(true));
  it("does not flag a 2-day-old draft", () => expect(isStalled("2026-10-27T13:00:00Z", now, STALL_DAYS.setupDraft)).toBe(false));
  it("flags a signer ID check after 7 days, not 6", () => {
    expect(isStalled("2026-10-22T11:00:00Z", now, STALL_DAYS.signerCheck)).toBe(true);
    expect(isStalled("2026-10-23T13:00:00Z", now, STALL_DAYS.signerCheck)).toBe(false);
  });
  it("names who it waits on", () => expect(waitingLabel("2026-10-28T11:00:00Z", now)).toBe("Waiting on the fund manager for 1 day"));
});

import { investorStageAction } from "./stalled-items";
describe("investor stall actions", () => {
  it("signing stage waits on the investor to sign", () => expect(investorStageAction("signature")).toEqual({ action: "Investor needs to sign the subscription documents", owner: "Investor" }));
  it("review stage waits on the fund manager", () => expect(investorStageAction("harmonious_review")?.owner).toBe("Fund manager"));
  it("closed investments are never stalled", () => expect(investorStageAction("closed")).toBeNull());
});
