import { describe, expect, it } from "vitest";
import { shouldAdmitAfterCountersign } from "./fund-countersign-complete.server";
import { investmentAttentionStep } from "./attention-investment";

const base = { stage: "harmonious_review", approved_to_fund_at: null, removed_at: null, investor_user_id: "investor" };

describe("countersign moves the investor to funding", () => {
  it("admits a submitted investment once the fund signatory signs", () => {
    expect(shouldAdmitAfterCountersign(base, "manager")).toBe(true);
  });
  it("never admits twice", () => {
    expect(shouldAdmitAfterCountersign({ ...base, approved_to_fund_at: "2026-10-21" }, "manager")).toBe(false);
  });
  it("never lets an investor admit their own investment", () => {
    expect(shouldAdmitAfterCountersign(base, "investor")).toBe(false);
  });
  it("does not admit before the investor submits", () => {
    expect(shouldAdmitAfterCountersign({ ...base, stage: "signature" }, "manager")).toBe(false);
  });
  it("does not admit removed investments", () => {
    expect(shouldAdmitAfterCountersign({ ...base, removed_at: "2026-10-21" }, "manager")).toBe(false);
  });
});

describe("investor dashboard next step", () => {
  it("tells the investor funding instructions are ready after approval", () => {
    expect(investmentAttentionStep({ stage: "awaiting_funds", approved_to_fund_at: "2026-10-21", funding_status: "not_funded", instructions_available: true } as any))
      .toEqual({ step: "fund", status: "Funding instructions are ready. Open Fund to send your investment.", waiting: false });
  });
  it("shows waiting on the fund manager after submission", () => {
    expect(investmentAttentionStep({ stage: "harmonious_review", approved_to_fund_at: null } as any)?.waiting).toBe(true);
  });
});

import { countersignAdmits } from "./fund-countersign-complete.server";
describe("fund countersignature is the approval and acceptance", () => {
  const ready = { stage: "funded", fundingStatus: "funded", acceptedAt: null, removedAt: null, investorUserId: "investor", signerUserId: "manager", outstanding: 0, blocking: 0 };
  it("admits once funds are in and the fund countersigned, with no separate Harmonious step", () => {
    expect(countersignAdmits(ready)).toBe(true);
  });
  it("admits when funds arrived before any manager approval", () => {
    expect(countersignAdmits({ ...ready, stage: "harmonious_review" })).toBe(true);
  });
  it("waits for funds", () => {
    expect(countersignAdmits({ ...ready, fundingStatus: "partially_funded" })).toBe(false);
  });
  it("waits while a requirement or blocking issue is open", () => {
    expect(countersignAdmits({ ...ready, outstanding: 1 })).toBe(false);
    expect(countersignAdmits({ ...ready, blocking: 1 })).toBe(false);
  });
  it("needs a countersignature and never the investor's own", () => {
    expect(countersignAdmits({ ...ready, signerUserId: null })).toBe(false);
    expect(countersignAdmits({ ...ready, signerUserId: "investor" })).toBe(false);
  });
  it("never accepts twice", () => {
    expect(countersignAdmits({ ...ready, acceptedAt: "2026-11-24" })).toBe(false);
  });
});
