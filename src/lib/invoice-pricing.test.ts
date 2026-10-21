import { describe, expect, it } from "vitest";
import { invoiceRateLines, invoiceRateCheck, type InvoicePricingInput } from "@/lib/invoice-pricing";

const base = (): InvoicePricingInput => ({ periodStart: "2026-10-01", periodEnd: "2026-10-31", offeringId: "fund",
  pricing: [{ id: "old", service_key: "nav", contracted_cents: 1000000, approved_at: "2026-01-01", approved_by: "ceo", superseded_at: "2026-09-01", pricing_model: "monthly", effective_date: "2026-01-01" },
    { id: "current", service_key: "nav", contracted_cents: 250000, approved_at: "2026-09-01", approved_by: "ceo", pricing_model: "monthly", effective_date: "2026-09-01" }],
  entitlements: [{ service_key: "nav", status: "active", offering_id: "fund", effective_date: "2026-09-01" }],
  sows: [], catalog: [], snapshots: [], snapshotLines: [], schedules: [], approverRoles: [{ user_id: "ceo", role: "executive" }], billedRefs: [] });

describe("manual invoice pricing consistency", () => {
  it("bills NAV at $2,500 once, not both historical and current rates", () => {
    const result = invoiceRateLines(base());
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.amount_cents).toBe(250000);
  });
  it("uses the fund's frozen displayed rate rather than future client prices", () => {
    const input = base();
    input.snapshots = [{ id: "snap", offering_id: "fund", status: "approved", created_at: "2026-09-01" }];
    input.snapshotLines = [{ id: "frozen", snapshot_id: "snap", service_key: "nav", final_cents: 250000, pricing_model: "monthly" }];
    const current = input.pricing[1]; if (current) current.contracted_cents = 750000;
    expect(invoiceRateLines(input).lines[0]?.unit_cents).toBe(250000);
  });
  it("never imports another fund's price", () => {
    const input = base(); input.pricing.unshift({ ...input.pricing[1], id: "other", offering_id: "other-fund", contracted_cents: 1 });
    expect(invoiceRateLines(input).lines[0]?.unit_cents).toBe(250000);
  });
  it("ignores future, expired and unapproved client prices", () => {
    const input = base();
    input.pricing.push(...[{ effective_date: "2027-01-01" }, { expires_on: "2026-09-30" }, { approved_by: "salesperson" }].map((change, i) => ({ ...input.pricing[1], id: `bad${i}`, contracted_cents: 1, ...change })));
    expect(invoiceRateLines(input).lines[0]?.amount_cents).toBe(250000);
  });
  it("keeps scheduled services out of manual preparation", () => {
    const input = base(); input.schedules = [{ id: "schedule", service_key: "nav", sow_id: "sow" }];
    expect(invoiceRateLines(input).lines).toHaveLength(0);
  });
  it("does not bill a recorded service period twice", () => {
    const input = base(); input.billedRefs = ["price:current:2026-10-01"];
    expect(invoiceRateLines(input).lines).toHaveLength(0);
  });
  it("keeps quarterly contracted quantity and total instead of billing a monthly equivalent", () => {
    const input = base(); input.sows = [{ id: "sow", status: "active", effective_date: "2026-10-01", generated_lines: [{ service_key: "nav", quantity: 3, unit_cents: 250000, amount_cents: 750000, billing_frequency: "quarterly" }] }];
    const line = invoiceRateLines(input).lines[0];
    expect(line?.quantity).toBe(3); expect(line?.amount_cents).toBe(750000);
  });
  it("blocks conflicting frozen agreement and displayed fund rates", () => {
    const input = base(); input.sows = [{ id: "sow", status: "active", effective_date: "2026-10-01", generated_lines: [{ service_key: "nav", unit_cents: 750000, billing_frequency: "monthly" }] }];
    input.snapshots = [{ id: "snap", offering_id: "fund", status: "approved", created_at: "2026-09-01" }];
    input.snapshotLines = [{ id: "line", snapshot_id: "snap", service_key: "nav", final_cents: 250000 }];
    expect(() => invoiceRateLines(input)).toThrow(/disagree/);
  });
  it("review compares the recorded unit rate and quantity without mutating history", () => {
    const line = { label: "NAV", unit_cents: 250000, quantity: 3, amount_cents: 750000 };
    expect(invoiceRateCheck(line, 250000).varianceCents).toBe(0);
    expect(invoiceRateCheck({ ...line, amount_cents: 750001 }, 250000).varianceCents).toBe(1);
    expect(line.amount_cents).toBe(750000);
  });
});