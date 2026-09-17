import { describe, expect, it } from "vitest";

import {
  DEFAULT_VALUATION_POLICY,
  canTransitionValuation,
  isImmutable,
  journalBalances,
  managerMay,
  missingMethodInputs,
  portfolioAsOf,
  rankSources,
  realization,
  realizationJournal,
  unrealizedJournal,
  valuationAsOf,
  valuationChange,
  valuationExceptions,
  type ValuationPolicy,
  type ValuationRecord,
} from "@/lib/valuation-model";

const policy: ValuationPolicy = { ...DEFAULT_VALUATION_POLICY };

describe("valuation lifecycle", () => {
  it("only lets a valuation become effective after approval", () => {
    expect(canTransitionValuation("draft", "review")).toBe(true);
    expect(canTransitionValuation("review", "approved")).toBe(true);
    expect(canTransitionValuation("approved", "effective")).toBe(true);
    expect(canTransitionValuation("draft", "effective")).toBe(false);
    expect(canTransitionValuation("review", "effective")).toBe(false);
  });

  it("never lets an effective or superseded valuation be rewritten", () => {
    expect(isImmutable("effective")).toBe(true);
    expect(isImmutable("superseded")).toBe(true);
    expect(canTransitionValuation("effective", "draft")).toBe(false);
    expect(canTransitionValuation("superseded", "effective")).toBe(false);
    expect(canTransitionValuation("rejected", "approved")).toBe(false);
  });

  it("keeps approval and effectiveness out of a fund manager's hands by default", () => {
    expect(managerMay("submit", policy)).toBe(true);
    expect(managerMay("acknowledge", policy)).toBe(true);
    expect(managerMay("challenge", policy)).toBe(true);
    expect(managerMay("approve", policy)).toBe(false);
    expect(managerMay("make_effective", policy)).toBe(false);
    expect(managerMay("supersede", policy)).toBe(false);
    // Even where a fund's workflow grants approval, effectiveness stays with Harmonious.
    const granted = { ...policy, managerMayApprove: true };
    expect(managerMay("approve", granted)).toBe(true);
    expect(managerMay("make_effective", granted)).toBe(false);
  });
});

describe("methodology and sources", () => {
  it("requires reproducible inputs, not free text", () => {
    expect(missingMethodInputs("recent_financing", {})).toEqual([
      "round_name",
      "round_date",
      "price_per_share_cents",
    ]);
    expect(
      missingMethodInputs("recent_financing", {
        round_name: "Series B",
        round_date: "2026-02-01",
        price_per_share_cents: 1234,
      }),
    ).toEqual([]);
  });

  it("ranks by the configured hierarchy but never auto-approves", () => {
    const decision = rankSources([
      { sourceType: "manager_mark", valueCents: 1_000_000 },
      { sourceType: "independent_third_party", valueCents: 900_000 },
    ]);
    expect(decision.preferred?.sourceType).toBe("independent_third_party");
    expect(decision.requiresReview).toBe(true);
  });

  it("returns disagreeing sources as conflicts for review", () => {
    const decision = rankSources([
      { sourceType: "independent_third_party", valueCents: 1_000_000 },
      { sourceType: "manager_mark", valueCents: 2_000_000 },
    ]);
    expect(decision.conflicts.length).toBe(1);
    const agreeing = rankSources([
      { sourceType: "independent_third_party", valueCents: 1_000_000 },
      { sourceType: "manager_mark", valueCents: 1_010_000 },
    ]);
    expect(agreeing.conflicts).toEqual([]);
  });
});

describe("exceptions", () => {
  const base = {
    valueCents: 1_000_000,
    priorValueCents: 1_000_000,
    quantity: 100,
    costBasisCents: 900_000,
    methodology: "third_party" as const,
    sourceType: "independent_third_party" as const,
    source: "Acme Valuations LLP",
    sourceDate: "2026-06-01",
    valuationDate: "2026-06-01",
    inputs: { provider: "Acme", report_date: "2026-06-01" },
    evidenceCount: 1,
  };

  it("passes a complete, fresh, well-evidenced valuation", () => {
    expect(valuationExceptions(base, policy, "2026-06-30")).toEqual([]);
  });

  it("flags a stale valuation", () => {
    expect(valuationExceptions(base, policy, "2027-06-30")).toContain("stale_valuation");
  });

  it("flags missing source, methodology inputs, quantity, cost basis and evidence", () => {
    const found = valuationExceptions(
      {
        ...base,
        source: null,
        quantity: null,
        costBasisCents: null,
        evidenceCount: 0,
        inputs: {},
      },
      policy,
      "2026-06-30",
    );
    expect(found).toContain("missing_valuation_source");
    expect(found).toContain("missing_quantity");
    expect(found).toContain("missing_cost_basis");
    expect(found).toContain("missing_valuation_evidence");
    expect(found).toContain("missing_valuation_methodology");
  });

  it("flags an impossible value and conflicting sources", () => {
    expect(valuationExceptions({ ...base, valueCents: -5 }, policy, "2026-06-30")).toContain(
      "impossible_valuation",
    );
    expect(
      valuationExceptions({ ...base, conflicts: ["sources disagree"] }, policy, "2026-06-30"),
    ).toContain("conflicting_valuation_sources");
  });

  it("flags a large move and calls an unevidenced manager mark unsupported", () => {
    const supported = valuationExceptions(
      { ...base, valueCents: 5_000_000 },
      policy,
      "2026-06-30",
    );
    expect(supported).toContain("valuation_change_threshold");
    expect(supported).not.toContain("unsupported_valuation_change");

    const unsupported = valuationExceptions(
      {
        ...base,
        valueCents: 5_000_000,
        sourceType: "manager_mark",
        methodology: "manager_mark",
        inputs: { manager_rationale: "internal view" },
        evidenceCount: 0,
      },
      policy,
      "2026-06-30",
    );
    expect(unsupported).toContain("unsupported_valuation_change");
  });
});

describe("ledger impact", () => {
  it("debits the asset and credits unrealised gain when value rises", () => {
    const journal = unrealizedJournal(1_000_000, 1_500_000, policy);
    expect(journal?.lines[0]).toMatchObject({ accountCode: "1110", debitCents: 500_000 });
    expect(journal?.lines[1]).toMatchObject({ accountCode: "4400", creditCents: 500_000 });
    expect(journalBalances(journal)).toBe(true);
  });

  it("debits unrealised loss and credits the asset when value falls", () => {
    const journal = unrealizedJournal(1_500_000, 1_000_000, policy);
    expect(journal?.lines[0]).toMatchObject({ accountCode: "4400", debitCents: 500_000 });
    expect(journal?.lines[1]).toMatchObject({ accountCode: "1110", creditCents: 500_000 });
  });

  it("does not recognise the same gain twice when a valuation is recomputed", () => {
    // First recognition of the move up to 1,500,000.
    const first = unrealizedJournal(1_000_000, 1_500_000, policy);
    expect(first?.lines[0]?.debitCents).toBe(500_000);
    // Superseded and recomputed at the same value: nothing left to recognise.
    expect(unrealizedJournal(1_500_000, 1_500_000, policy)).toBeNull();
    // A revision to 1,600,000 recognises only the incremental 100,000.
    expect(unrealizedJournal(1_500_000, 1_600_000, policy)?.lines[0]?.debitCents).toBe(100_000);
  });

  it("prepares nothing where the fund's policy turns unrealised marking off", () => {
    expect(unrealizedJournal(1_000_000, 2_000_000, { ...policy, unrealizedPolicyEnabled: false })).toBeNull();
  });
});

describe("realizations", () => {
  it("relieves cost and recognises gain without zeroing the position", () => {
    const result = realization({
      quantityHeld: 100,
      quantitySold: 25,
      costBasisCents: 1_000_000,
      proceedsCents: 400_000,
    });
    expect(result.costBasisRelievedCents).toBe(250_000);
    expect(result.realizedGainCents).toBe(150_000);
    expect(result.remainingQuantity).toBe(75);
    expect(result.remainingCostBasisCents).toBe(750_000);
    expect(result.isFullDisposition).toBe(false);
    // The remaining 75 units keep their own unrealised mark — realisation
    // never sets the asset's fair value to zero.
    expect(unrealizedJournal(750_000, 900_000, policy)?.lines[0]?.debitCents).toBe(150_000);
  });

  it("books a realised loss and balances the disposition journal", () => {
    const result = realization({
      quantityHeld: 100,
      quantitySold: 100,
      costBasisCents: 1_000_000,
      proceedsCents: 600_000,
    });
    expect(result.realizedGainCents).toBe(-400_000);
    expect(result.isFullDisposition).toBe(true);
    const journal = realizationJournal(result, 600_000, policy);
    expect(journalBalances(journal)).toBe(true);
    expect(journal?.lines.some((l) => l.accountCode === "4300" && l.debitCents === 400_000)).toBe(true);
  });

  it("refuses to sell more than is held", () => {
    expect(() =>
      realization({ quantityHeld: 10, quantitySold: 11, costBasisCents: 100, proceedsCents: 100 }),
    ).toThrow();
  });
});

describe("as-of reporting", () => {
  const versions: ValuationRecord[] = [
    { id: "v1", assetId: "a1", effectiveDate: "2026-03-31", version: 1, status: "superseded", valueCents: 1_000_000 },
    { id: "v2", assetId: "a1", effectiveDate: "2026-06-30", version: 2, status: "superseded", valueCents: 1_400_000 },
    { id: "v3", assetId: "a1", effectiveDate: "2026-09-30", version: 3, status: "effective", valueCents: 2_000_000 },
    { id: "d1", assetId: "a1", effectiveDate: "2026-06-30", version: 4, status: "draft", valueCents: 9_999_999 },
    { id: "b1", assetId: "a2", effectiveDate: "2026-06-30", version: 1, status: "effective", valueCents: 500_000 },
  ];

  it("returns the version effective at the date, not today's latest", () => {
    expect(valuationAsOf(versions, "2026-06-30")?.id).toBe("v2");
    expect(valuationAsOf(versions, "2026-08-15")?.id).toBe("v2");
    expect(valuationAsOf(versions, "2026-12-31")?.id).toBe("v3");
    expect(valuationAsOf(versions, "2026-01-01")).toBeNull();
  });

  it("ignores drafts and unapproved work in progress", () => {
    expect(valuationAsOf(versions, "2026-06-30")?.valueCents).toBe(1_400_000);
  });

  it("totals the whole portfolio at the requested date", () => {
    const q2 = portfolioAsOf(["a1", "a2"], versions, "2026-06-30");
    expect(q2.totalValueCents).toBe(1_900_000);
    const q3 = portfolioAsOf(["a1", "a2"], versions, "2026-09-30");
    expect(q3.totalValueCents).toBe(2_500_000);
    // An asset with no effective mark at the date contributes nothing rather
    // than borrowing a later value.
    const early = portfolioAsOf(["a1", "a2"], versions, "2026-04-01");
    expect(early.totalValueCents).toBe(1_000_000);
  });
});

describe("change arithmetic", () => {
  it("computes change in dollars and percent against the prior mark", () => {
    expect(valuationChange(1_000_000, 1_250_000)).toEqual({ changeCents: 250_000, changePct: 25 });
    expect(valuationChange(null, 1_000_000)).toEqual({ changeCents: 1_000_000, changePct: null });
  });
});
