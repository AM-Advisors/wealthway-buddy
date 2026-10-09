import { describe, it, expect } from "vitest";
import { valuationEvidenceStatus, evidenceGateError, movementBasisCents, unrealizedJournal, DEFAULT_VALUATION_POLICY } from "@/lib/valuation-model";

// Permanent regression: DEMO / SYNTHETIC ASSUMPTION valuations never act as evidence.
describe("synthetic valuation assumptions", () => {
  it("is its own classification even when evidence rows or waivers exist", () => {
    expect(valuationEvidenceStatus({ policyRequired: true, evidenceCount: 3, waived: true, evidenceBasis: "synthetic_assumption" })).toBe("synthetic_assumption");
  });
  it("is refused on a real fund", () => {
    expect(evidenceGateError("synthetic_assumption", { syntheticFund: false })).toMatch(/TEST\/DEMO/);
    expect(evidenceGateError("synthetic_assumption")).toMatch(/TEST\/DEMO/);
  });
  it("is accepted only on an isolated synthetic fund", () => {
    expect(evidenceGateError("synthetic_assumption", { syntheticFund: true })).toBeNull();
  });
  it("does not weaken the production evidence gate", () => {
    expect(valuationEvidenceStatus({ policyRequired: true, evidenceCount: 0, waived: false })).toBe("evidence_required");
    expect(evidenceGateError("evidence_required", { syntheticFund: true })).not.toBeNull();
  });
});

describe("movement basis", () => {
  it("adds follow-on cost to the recognised value so it is not booked as gain (Gridwise)", () => {
    const basis = movementBasisCents({ lastRecognizedCents: 275_000_000, costBasisCents: 275_000_000, costAddedSinceRecognizedCents: 25_000_000 });
    expect(basis).toBe(300_000_000);
    expect(unrealizedJournal(basis, 300_000_000, DEFAULT_VALUATION_POLICY)).toBeNull();
  });
  it("uses cost for a holding never marked (Northstar/Brightline)", () => {
    expect(movementBasisCents({ lastRecognizedCents: null, costBasisCents: 200_000_000, costAddedSinceRecognizedCents: 0 })).toBe(200_000_000);
  });
  it("never re-recognises opening appreciation (Lumen +$500k, Parcel -$400k)", () => {
    const lumen = unrealizedJournal(350_000_000, 400_000_000, DEFAULT_VALUATION_POLICY)!;
    const parcel = unrealizedJournal(200_000_000, 160_000_000, DEFAULT_VALUATION_POLICY)!;
    expect(lumen.lines[0]?.debitCents).toBe(50_000_000);
    expect(parcel.lines[0]?.debitCents).toBe(40_000_000);
  });
});
