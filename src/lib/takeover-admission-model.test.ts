import { describe, expect, it } from "vitest";

import {
  EVIDENCE_REQUIREMENTS,
  batchReconciliation,
  capitalCallEligibility,
  decisionError,
  economicDiscrepancies,
  normalizeCompliance,
  preparationErrors,
  remediationFor,
  statusAfterPreparation,
  type EvidenceItem,
} from "@/lib/takeover-admission-model";

const allVerified: EvidenceItem[] = EVIDENCE_REQUIREMENTS.map((r) => ({ key: r.key, status: "verified_from_source" }));
const input = { investorName: "Northwind (DEMO)", investorType: "llc", classLabel: "A", sourceSystem: "DEMO prior admin", asOfDate: "2025-12-31", relationshipEffectiveDate: "2024-03-01", commitmentCents: 500_000_000, calledCents: 200_000_000, contributedCents: 200_000_000, openingCapitalCents: 199_000_000, evidence: allVerified, compliance: {} };

describe("takeover admission", () => {
  it("validates preparation and requires a status for every evidence item", () => {
    expect(preparationErrors(input)).toEqual([]);
    expect(preparationErrors({ ...input, calledCents: 600_000_000 })).toContain("Historical called exceeds commitment.");
    expect(preparationErrors({ ...input, evidence: [] }).length).toBe(EVIDENCE_REQUIREMENTS.length);
  });
  it("never represents missing or unreviewed evidence as approvable", () => {
    const ev = allVerified.map((e) => (e.key === "commitment" ? { ...e, status: "missing" as const } : e));
    expect(statusAfterPreparation(ev)).toBe("evidence_review");
    expect(statusAfterPreparation(allVerified)).toBe("approval_required");
    expect(decisionError({ status: "approval_required", preparedBy: "p", evidence: ev }, "r", true, null)).toMatch(/Evidence still blocks/);
  });
  it("the preparer can never decide their own admission (permanent)", () => {
    expect(decisionError({ status: "approval_required", preparedBy: "p", evidence: allVerified }, "p", true, null)).toMatch(/someone other/);
    expect(decisionError({ status: "approval_required", preparedBy: "p", evidence: allVerified }, "r", true, null)).toBeNull();
  });
  it("never verifies a payout destination and keeps compliance separate from ownership", () => {
    const c = normalizeCompliance({ payout_destination: "prior_admin_verified" as any, tax_document: "refresh_required" });
    expect(c.payout_destination).toBe("not_verified");
    expect(c.kyc).toBe("missing");
    const r = remediationFor(c, allVerified);
    expect(r.find((x) => x.key === "payout_destination")?.blocks).toEqual(["payout"]);
    expect(r.find((x) => x.key === "tax_document")?.blocks).not.toContain("capital_call");
  });
  it("refresh items do not block a capital call; missing admission does", () => {
    const base = { positionId: "x", name: "n", origin: "takeover_prior_administrator" as const, positionStatus: "active", commitmentCents: 100, calledCents: 40, contributedCents: 40, flags: ["Obtain current W-9 / W-8"] };
    expect(capitalCallEligibility({ ...base, admissionStatus: "admitted" })).toMatchObject({ eligible: true, remainingCents: 60 });
    expect(capitalCallEligibility({ ...base, admissionStatus: "approval_required" }).eligible).toBe(false);
    expect(capitalCallEligibility({ ...base, admissionStatus: "admitted", calledCents: 100 }).eligible).toBe(false);
  });
  it("flags ownership discrepancies and reconciles a batch exactly", () => {
    expect(economicDiscrepancies({ commitmentCents: 1, calledCents: 1, contributedCents: 1 }, { commitmentCents: 1, calledCents: 2, contributedCents: 1 })).toHaveLength(1);
    const rec = batchReconciliation([{ commitmentCents: 10, calledCents: 4, contributedCents: 4, openingCapitalCents: 3 }], { count: 1, commitmentCents: 10, calledCents: 4, contributedCents: 4, openingCapitalCents: 3 });
    expect(rec.ok).toBe(true);
  });
});
