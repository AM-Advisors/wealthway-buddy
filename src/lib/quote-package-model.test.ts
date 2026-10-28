import { describe, expect, it } from "vitest";
import { packageBlocker, packageInvoicePlan, packageThrough } from "./quote-package-model";

describe("quote package plan", () => {
  it("covers through December 31 of the following year", () => {
    expect(packageThrough("2026-10-28")).toBe("2027-12-31");
  });
  it("bills a quarterly line every quarter, due at the start of each quarter", () => {
    const plan = packageInvoicePlan("q", 1, [{ label: "White Glove", line_cents: 1200000, billing_frequency: "quarterly", first_bill_on: "2026-10-01" }], "2026-10-28");
    expect(plan.map((p) => p.dueOn)).toEqual(["2026-10-01", "2027-01-01", "2027-04-01", "2027-07-01", "2027-10-01"]);
    expect(plan.every((p) => p.amountCents === 1200000)).toBe(true);
  });
  it("bills a one-time line once and skips zero lines", () => {
    const plan = packageInvoicePlan("q", 1, [{ label: "Setup", line_cents: 750000 }, { label: "Free", line_cents: 0, billing_frequency: "annual" }], "2026-10-28");
    expect(plan).toHaveLength(1);
    expect(plan[0]?.dueOn).toBe("2026-10-28");
  });
  it("gives every invoice a unique reference so it can't be sent twice", () => {
    const plan = packageInvoicePlan("q", 2, [{ label: "A", line_cents: 100, billing_frequency: "monthly" }], "2026-01-01");
    expect(new Set(plan.map((p) => p.ref)).size).toBe(plan.length);
  });
  it("only sends approved quotes, once", () => {
    expect(packageBlocker({ status: "pending_approval", client_id: "c" })).not.toBeNull();
    expect(packageBlocker({ status: "approved", client_id: "c" })).toBeNull();
    expect(packageBlocker({ status: "approved", client_id: "c", package_issued_at: "x" })).not.toBeNull();
  });
});
