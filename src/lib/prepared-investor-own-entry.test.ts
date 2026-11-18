import { describe, expect, it } from "vitest";
import { fingerprint, investingPartyName, ownEntrySnapshotPlan, signingGate, type SnapshotRow } from "@/lib/prepared-investor-workflow";

const values = { investor_legal_name: "Apoorva Inani", commitment_amount: "$20,000.00", fund_name: "Fund", effective_date: "2026-11-18" };
const snap = (over: Partial<SnapshotRow> = {}): SnapshotRow => ({
  id: "s1", onboarding_id: "ob", offering_id: "f", document_id: "d", version: 1, status: "reviewed",
  merge_values: values, reviewed_by: "u1", reviewed_fingerprint: fingerprint(values), ...over,
});
const base = { hasPreparedDraft: false, missing: 0, currentMergeValues: values, investorUserId: "u1" };

describe("investing party name on documents", () => {
  it("uses the investment profile name even when the login profile has none", () => {
    expect(investingPartyName({ investmentProfileLegalName: "Apoorva Inani", loginLegalName: null })).toBe("Apoorva Inani");
  });
  it("prefers the investing party over the login account name", () => {
    expect(investingPartyName({ investmentProfileLegalName: "J GIRARDI K GIRARDI REV TRUST", loginLegalName: "Kimberly Girardi" })).toBe("J GIRARDI K GIRARDI REV TRUST");
  });
  it("falls back to the person's legal first and last name", () => {
    expect(investingPartyName({ investmentProfileLegalName: " ", personFirst: "Apoorva", personLast: "Inani" })).toBe("Apoorva Inani");
  });
  it("returns nothing when no name is recorded anywhere", () => {
    expect(investingPartyName({})).toBeNull();
  });
});

describe("investor-entered signing records the current document version", () => {
  it("creates a reviewed version when none exists, so the gate passes", () => {
    expect(ownEntrySnapshotPlan({ ...base, latest: null })).toBe("create");
    const created = snap();
    const gate = signingGate({ investorUserId: "u1", onboardingId: "ob", offeringId: "f", documentId: "d", latest: created, currentMergeValues: values, missing: [], templateReady: true, signerConfigReady: true, prerequisitesMet: true });
    expect(gate.ok).toBe(true);
  });
  it("never applies to staff-prepared drafts", () => {
    expect(ownEntrySnapshotPlan({ ...base, hasPreparedDraft: true, latest: null })).toBe("none");
  });
  it("never covers missing information", () => {
    expect(ownEntrySnapshotPlan({ ...base, missing: 1, latest: null })).toBe("none");
  });
  it("creates a new version when details changed", () => {
    expect(ownEntrySnapshotPlan({ ...base, latest: snap({ merge_values: { ...values, commitment_amount: "$10,000.00" } }) })).toBe("create");
  });
  it("keeps an already reviewed current version", () => {
    expect(ownEntrySnapshotPlan({ ...base, latest: snap() })).toBe("none");
  });
  it("marks an unreviewed current version as reviewed", () => {
    expect(ownEntrySnapshotPlan({ ...base, latest: snap({ status: "prepared", reviewed_by: null, reviewed_fingerprint: null }) })).toBe("mark_reviewed");
  });
  it("ignores a different day's date on an existing version", () => {
    expect(ownEntrySnapshotPlan({ ...base, currentMergeValues: { ...values, effective_date: "2026-11-19" }, latest: snap() })).toBe("none");
  });
});
