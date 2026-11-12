import { describe, expect, it } from "vitest";
import { COMMITMENT_EVENT_TYPES } from "@/lib/allocation-model";
import { closingLedgerEntries, ledgerFigures } from "@/lib/closing-ledger";

const base = {
  onboardingId: "ob-1",
  positionId: "pos-1",
  offeringId: "fund-1",
  commitmentCents: 5_000_000,
  fundedCents: 5_000_000,
  closingDate: "2026-11-09",
  recordedBy: "staff-1",
  existing: [],
};

describe("closing ledger entries", () => {
  it("records the commitment with an event type the ledger accepts", () => {
    const entries = closingLedgerEntries(base);
    expect(entries.map((e) => e.event_type)).toEqual(["original_commitment", "contribution"]);
    for (const e of entries) expect(COMMITMENT_EVENT_TYPES).toContain(e.event_type);
    expect(entries[0]!.amount_cents).toBe(5_000_000);
    expect(entries[1]!.amount_cents).toBe(5_000_000);
  });

  it("never adds a second commitment or contribution to a position that already has them", () => {
    expect(
      closingLedgerEntries({ ...base, existing: [{ event_type: "original_commitment" }, { event_type: "contribution_settled" }] }),
    ).toEqual([]);
    expect(
      closingLedgerEntries({ ...base, existing: [{ event_type: "capital_call", dedupe_key: "onboarding:ob-1:commitment" }] }).map((e) => e.event_type),
    ).toEqual(["contribution"]);
  });
});

describe("figures before the first statement", () => {
  it("shows a closed $50,000 investment as committed and fully contributed", () => {
    const f = ledgerFigures([
      { event_type: "original_commitment", amount_cents: 5_000_000, effective_date: "2026-11-09" },
      { event_type: "contribution", amount_cents: 5_000_000, effective_date: "2026-11-09" },
    ]);
    expect(f).toEqual({ commitmentCents: 5_000_000, contributedCents: 5_000_000, unfundedCommitmentCents: 0, distributionsCents: 0 });
  });

  it("shows the unfunded remainder when only part has been contributed", () => {
    const f = ledgerFigures([
      { event_type: "original_commitment", amount_cents: 10_000_000, effective_date: "2026-01-01" },
      { event_type: "contribution", amount_cents: 4_000_000, effective_date: "2026-02-01" },
    ]);
    expect(f.unfundedCommitmentCents).toBe(6_000_000);
  });
});
