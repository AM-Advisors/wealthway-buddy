import { describe, expect, it } from "vitest";
import { investmentWireStage } from "@/lib/wire-tracking-model";

describe("wire tracking for current investment records", () => {
  it("shows Funds received only for reconciled money", () => {
    expect(investmentWireStage({ funding_status: "funded" })).toBe("received");
    expect(investmentWireStage({ funding_status: "investor_reports_sent" })).toBe("submitted");
  });
  it("shows bank matches still being reconciled as with the bank", () => {
    expect(investmentWireStage({ funding_status: "bank_transaction_detected" })).toBe("processing");
  });
  it("shows an approved investment as waiting on the investor's wire", () => {
    expect(investmentWireStage({ funding_status: "not_funded", approved_to_fund_at: "2026-11-20T00:00:00Z" })).toBe("awaiting_wire");
  });
  it("shows a returned wire as needing attention", () => {
    expect(investmentWireStage({ funding_status: "returned" })).toBe("problem");
  });
  it("shows an investment that has not reached funding as no wire yet", () => {
    expect(investmentWireStage({ funding_status: null })).toBe("not_started");
  });
});
