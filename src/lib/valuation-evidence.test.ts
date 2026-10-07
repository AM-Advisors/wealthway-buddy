import { describe, expect, it } from "vitest";
import { evidenceGateError, evidenceWaiverError, valuationEvidenceStatus, valuationExceptions } from "@/lib/valuation-model";

describe("valuation evidence (pilot M9)", () => {
  it("derives one status", () => {
    expect(valuationEvidenceStatus({ policyRequired: true, evidenceCount: 1, waived: false })).toBe("evidence_provided");
    expect(valuationEvidenceStatus({ policyRequired: true, evidenceCount: 0, waived: false })).toBe("evidence_required");
    expect(valuationEvidenceStatus({ policyRequired: true, evidenceCount: 0, waived: true })).toBe("evidence_waived");
    expect(valuationEvidenceStatus({ policyRequired: false, evidenceCount: 0, waived: false })).toBe("evidence_not_required");
  });
  it("blocks only when evidence is required and absent", () => {
    expect(evidenceGateError("evidence_required")).toMatch(/required/);
    expect(evidenceGateError("evidence_waived")).toBeNull();
  });
  it("does not report missing evidence once waived", () => {
    const base = { valueCents: 100, priorValueCents: null, quantity: 1, costBasisCents: 100, methodology: null, valuationDate: "2026-07-31" } as const;
    expect(valuationExceptions({ ...base, evidenceStatus: "evidence_waived" }, undefined, "2026-08-01")).not.toContain("missing_valuation_evidence");
    expect(valuationExceptions({ ...base, evidenceStatus: "evidence_required" }, undefined, "2026-08-01")).toContain("missing_valuation_evidence");
  });
  it("requires an independent, reasoned waiver", () => {
    expect(evidenceWaiverError({ reason: "short", waiverUserId: "a", preparedBy: "b" })).toMatch(/reason/);
    expect(evidenceWaiverError({ reason: "Manager mark per policy 4.2", waiverUserId: "a", preparedBy: "a" })).toMatch(/preparer/);
    expect(evidenceWaiverError({ reason: "Manager mark per policy 4.2", waiverUserId: "a", preparedBy: "b" })).toBeNull();
  });
});
