import { describe, expect, it } from "vitest";
import { buildPaymentSchedule, paymentScheduleKey } from "./payment-schedule-model";

const line = { service_key: "administration", amount_cents: 10000, billing_frequency: "quarterly", first_bill_on: "2026-01-31" };
describe("signed-SOW payment schedules", () => {
  it("uses quarterly dates anchored to the signed first bill date", () => {
    const result = buildPaymentSchedule("sow", [line], "2026-10-31");
    expect(result.items.map(i => i.due_on)).toEqual(["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"]);
    expect(result.reviews).toEqual([]);
    expect(result.items.every(i => i.amount_cents === 10000)).toBe(true);
  });
  it("uses annual dates and restores leap-day anniversaries", () => {
    expect(buildPaymentSchedule("sow", [{ ...line, billing_frequency: "annual", first_bill_on: "2028-02-29" }], "2032-02-29").items.map(i => i.due_on))
      .toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });
  it("skips one-time services without requiring recurring fields", () => {
    expect(buildPaymentSchedule("sow", [{ billing_frequency: "one_time" }], "2027-01-01")).toEqual({ items: [], reviews: [] });
  });
  it("flags missing frequency instead of inventing terms", () => {
    expect(buildPaymentSchedule("sow", [{ ...line, billing_frequency: null }], "2027-01-01"))
      .toEqual({ items: [], reviews: [{ lineIndex: 0, serviceKey: "administration", reason: "missing_frequency" }] });
  });
  it("flags unsupported frequency, invalid dates, missing service, and invalid amounts", () => {
    for (const [patch, reason] of [
      [{ billing_frequency: "monthly" }, "unsupported_frequency"],
      [{ first_bill_on: "2026-02-30" }, "invalid_first_bill_on"],
      [{ first_bill_on: null }, "invalid_first_bill_on"],
      [{ service_key: null }, "missing_service"],
      [{ amount_cents: -1 }, "invalid_amount"],
    ] as const) {
      const result = buildPaymentSchedule("sow", [{ ...line, ...patch }], "2027-01-01");
      expect(result.items).toEqual([]);
      expect(result.reviews[0]?.reason).toBe(reason);
    }
  });
  it("does not schedule before the first signed bill date", () => {
    expect(buildPaymentSchedule("sow", [line], "2026-01-30").items).toEqual([]);
  });
  it("is deterministic and keys isolate SOW, service, and date", () => {
    expect(buildPaymentSchedule("sow", [line], "2027-01-01")).toEqual(buildPaymentSchedule("sow", [line], "2027-01-01"));
    expect(new Set([paymentScheduleKey("s1", "a", "2026-01-01"), paymentScheduleKey("s2", "a", "2026-01-01"), paymentScheduleKey("s1", "b", "2026-01-01"), paymentScheduleKey("s1", "a", "2026-04-01")]).size).toBe(4);
  });
  it("refuses duplicate services rather than silently billing twice", () => {
    expect(() => buildPaymentSchedule("sow", [line, line], "2027-01-01")).toThrow(/Duplicate/);
  });
  it("rejects an invalid horizon", () => {
    expect(() => buildPaymentSchedule("sow", [line], "not-a-date")).toThrow();
  });
});
