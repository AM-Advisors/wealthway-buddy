import { describe, expect, it } from "vitest";

import { invoicesInPeriod, periodRange, reportsInPeriod, statementTotals } from "./period-downloads-model";

describe("period downloads", () => {
  it("quarter ranges cover exact calendar quarters", () => {
    expect(periodRange({ kind: "quarter", year: 2026, quarter: 3 })).toMatchObject({ start: "2026-07-01", end: "2026-09-30", slug: "2026-Q3" });
    expect(periodRange({ kind: "quarter", year: 2028, quarter: 1 }).end).toBe("2028-03-31");
    expect(periodRange({ kind: "year", year: 2027 })).toMatchObject({ start: "2027-01-01", end: "2027-12-31" });
  });

  it("never includes drafts and files invoices by service period", () => {
    const list = [
      { id: "a", status: "issued", period_start: "2026-08-24", issue_date: "2026-10-28" },
      { id: "b", status: "draft", period_start: "2026-08-01", issue_date: null },
      { id: "c", status: "paid", period_start: null, issue_date: "2026-10-01" },
    ];
    expect(invoicesInPeriod(list, { kind: "quarter", year: 2026, quarter: 3 }).map((i) => i.id)).toEqual(["a"]);
    expect(invoicesInPeriod(list, { kind: "year", year: 2026 }).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("cancelled invoices are not owed", () => {
    const t = statementTotals(
      [{ status: "paid", total_cents: 750000 }, { status: "void", total_cents: 1900000 }, { status: "issued", total_cents: 1200000 }],
      (i: any) => (i.status === "paid" ? { paidCents: i.total_cents, remainingCents: 0 } : { paidCents: 0, remainingCents: i.total_cents }),
    );
    expect(t).toEqual({ billedCents: 1950000, paidCents: 750000, remainingCents: 1200000, cancelledCents: 1900000, count: 2 });
  });

  it("reports filed by period end", () => {
    expect(reportsInPeriod([{ period_end: "2026-09-30" }, { period_end: "2026-12-31" }], { kind: "quarter", year: 2026, quarter: 4 })).toHaveLength(1);
  });
});
