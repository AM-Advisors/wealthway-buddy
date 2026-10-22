import { nextPayout, type PayoutStatus } from "./commission-model";
import { describe, expect, it } from "vitest";
import { payoutDueDate, PAYOUT_RECORDERS } from "./commission-model";

describe("payoutDueDate", () => {
  it("Feb 10 pays out Mar 31", () => expect(payoutDueDate("2026-02-10")).toBe("2026-03-31"));
  it("Dec 31 pays out Dec 31", () => expect(payoutDueDate("2026-12-31")).toBe("2026-12-31"));
  it("Apr 1 pays out Jun 30", () => expect(payoutDueDate("2026-04-01")).toBe("2026-06-30"));
});
describe("payout recorders", () => {
  it("only Finance, CRO and CEO", () => expect([...PAYOUT_RECORDERS].sort()).toEqual(["cro", "executive", "finance"]));
});

 describe('next payout selection', () => {
  const row = (status: PayoutStatus, payoutDue: string | null) => ({ status, payoutDue });
  it('prefers scheduled over earlier expected', () => {
    const scheduled = row('scheduled', '2027-06-30');
    expect(nextPayout([row('expected', '2027-03-31'), scheduled])).toBe(scheduled);
  });
  it('excludes cancelled, paid out, not earned and undated rows', () => {
    expect(nextPayout([row('cancelled', '2026-12-31'), row('paid_out', '2026-12-31'), row('not_earned', '2026-12-31'), row('scheduled', null)])).toBeNull();
    expect(nextPayout([])).toBeNull();
  });
  it('selects earliest date for either eligible status and preserves ties without mutation', () => {
    for (const status of ['expected', 'scheduled'] as const) {
      const first = row(status, '2027-03-31');
      const rows = [row(status, '2027-06-30'), first, row(status, '2027-03-31')];
      expect(nextPayout(rows)).toBe(first);
      expect(rows[0]?.payoutDue).toBe('2027-06-30');
    }
  });
});
