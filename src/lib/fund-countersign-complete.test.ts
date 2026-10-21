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
