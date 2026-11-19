import { describe, it, expect } from "vitest";
import { manualReceiptToConfirm } from "./manual-receipt-match";

describe("hand-recorded receipt then bank deposit counts once", () => {
  it("a bank deposit of the same amount confirms the hand-recorded receipt", () => {
    expect(manualReceiptToConfirm([{ id: "m1", amountCents: 5_000_000 }], [], 5_000_000)).toBe("m1");
  });
  it("a receipt already confirmed by an earlier bank deposit is not reused", () => {
    expect(manualReceiptToConfirm([{ id: "m1", amountCents: 5_000_000 }], [{ confirmsManualReceiptId: "m1" }], 5_000_000)).toBeNull();
  });
  it("a different amount is new money", () => {
    expect(manualReceiptToConfirm([{ id: "m1", amountCents: 5_000_000 }], [], 2_500_000)).toBeNull();
  });
});
