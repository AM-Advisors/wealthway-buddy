import { describe, expect, it } from "vitest";
import { buildPayoutCalendar, periodEnd, type CalendarRow } from "./payout-calendar-model";

const row = (o: Partial<CalendarRow> & { baseCents?: number }): CalendarRow => ({ quoteId: "q1", client: "Acme", service: "Fund admin", layer: "ae", amountCents: 100, status: "expected", payoutDue: "2026-12-31", ...o });
const range = { from: "2026-10-01", to: "2026-12-31" };

describe("payout calendar", () => {
  it("quarterly and annual periods end the day before the next bill", () => {
    expect(periodEnd("2026-10-01", "quarterly")).toBe("2026-12-31");
    expect(periodEnd("2026-11-15", "annual")).toBe("2027-11-14");
  });
  it("totals same-day payouts by status", () => {
    const { days } = buildPayoutCalendar([row({ amountCents: 100 }), row({ amountCents: 50, layer: "cro" }), row({ amountCents: 30, status: "scheduled" })], [], range);
    expect(days).toHaveLength(1);
    expect(days[0]!.totals).toEqual({ expected: 150, scheduled: 30 });
  });
  it("leaves out not-earned rows and payouts outside the range", () => {
    const { days } = buildPayoutCalendar([row({ status: "not_earned" }), row({ payoutDue: "2027-03-31" })], [], range);
    expect(days).toHaveLength(0);
  });
  it("counts a billing period once across commission splits and clips it to the range", () => {
    const { spans } = buildPayoutCalendar([row({ frequency: "annual", periodStart: "2026-11-01", baseCents: 1200000 }), row({ layer: "cro", frequency: "annual", periodStart: "2026-11-01", baseCents: 1200000 })], [], range);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ start: "2026-11-01", end: "2026-12-31", amountCents: 1200000 });
  });
  it("marks SOW signed dates inside the range only", () => {
    const { signed } = buildPayoutCalendar([], [{ id: "q1", label: "Q-1", signedAt: "2026-10-05T12:00:00Z" }, { id: "q2", label: "Q-2", signedAt: "2026-01-05T00:00:00Z" }, { id: "q3", label: "Q-3", signedAt: null }], range);
    expect(signed.map(s => s.date)).toEqual(["2026-10-05"]);
  });
  it("carries deal amounts onto signed marks", () => {
    const { signed } = buildPayoutCalendar([], [{ id: "q1", label: "Q-1", signedAt: "2026-10-05T12:00:00Z", signedAmountCents: 120000, receivedAmountCents: 60000, committedAmountCents: 18000 }], range);
    expect(signed[0]).toMatchObject({ signedAmountCents: 120000, receivedAmountCents: 60000, committedAmountCents: 18000 });
  });
});
