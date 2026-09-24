import { describe, expect, it } from "vitest";
import {
  actionAccessible, completionSatisfiesCurrent, confirmedFacts, countersignState, docApplies,
  effectiveResolverFacts, fingerprint, nextAction, signingGate, titleIsSafe, type SnapshotRow,
} from "./prepared-investor-workflow";

const mv = { investor_name: "QA TEST Investor", commitment: "$50,000" };
const snap = (o: Partial<SnapshotRow> = {}): SnapshotRow => ({
  id: "s1", onboarding_id: "o1", offering_id: "f1", document_id: "d1", version: 2, status: "reviewed",
  merge_values: mv, reviewed_by: "inv", reviewed_fingerprint: fingerprint(mv), ...o,
});
const gate = (o: Partial<Parameters<typeof signingGate>[0]> = {}) => signingGate({
  investorUserId: "inv", onboardingId: "o1", offeringId: "f1", documentId: "d1", latest: snap(),
  currentMergeValues: mv, missing: [], templateReady: true, signerConfigReady: true, prerequisitesMet: true, ...o,
});

describe("signing enforcement", () => {
  it("allows only the exact reviewed version", () => { expect(gate()).toMatchObject({ ok: true, snapshotId: "s1", version: 2 }); });
  it("blocks unreviewed documents", () => { expect(gate({ latest: snap({ status: "generated", reviewed_by: null }) }).ok).toBe(false); });
  it("blocks when reviewed by someone else", () => { expect(gate({ latest: snap({ reviewed_by: "manager" }) }).ok).toBe(false); });
  it("blocks when merge values changed after review", () => {
    const r = gate({ currentMergeValues: { ...mv, commitment: "$75,000" } });
    expect(r).toMatchObject({ ok: false, next: "regenerate" });
  });
  it("blocks stale or superseded versions", () => {
    expect(gate({ latest: snap({ status: "stale" }) }).ok).toBe(false);
    expect(gate({ latest: snap({ status: "superseded" }) }).ok).toBe(false);
  });
  it("blocks missing fields, unready templates and unmet prerequisites", () => {
    expect(gate({ missing: [{ message: "Signer title missing." }] })).toMatchObject({ ok: false, next: "complete_information" });
    expect(gate({ templateReady: false }).ok).toBe(false);
    expect(gate({ signerConfigReady: false }).ok).toBe(false);
    expect(gate({ prerequisitesMet: false }).ok).toBe(false);
  });
  it("blocks snapshots from another onboarding, fund or document", () => {
    expect(gate({ latest: snap({ onboarding_id: "o2" }) }).ok).toBe(false);
    expect(gate({ latest: snap({ offering_id: "f2" }) }).ok).toBe(false);
    expect(gate({ latest: snap({ document_id: "d2" }) }).ok).toBe(false);
    expect(gate({ latest: null }).ok).toBe(false);
  });
  it("counts a Box completion only for the current version", () => {
    expect(completionSatisfiesCurrent({ snapshot_id: "s1" }, "s1")).toBe(true);
    expect(completionSatisfiesCurrent({ snapshot_id: "old" }, "s1")).toBe(false);
    expect(completionSatisfiesCurrent(null, "s1")).toBe(false);
    expect(completionSatisfiesCurrent({ snapshot_id: null }, null)).toBe(true);
  });
});

describe("corrected answers drive requirements", () => {
  it("confirmed values win over prepared ones", () => {
    const f = effectiveResolverFacts({ profileType: "individual", requestedAmountCents: 5_000_000, country: "US" },
      { profile_type: "trust", commitment_cents: 7_500_000 });
    expect(f).toEqual({ profileType: "trust", requestedAmountCents: 7_500_000, country: "US" });
  });
  it("unconfirmed prepared values are not treated as confirmed", () => {
    const c = confirmedFacts({
      a: { key: "profile_type", status: "prepared", currentValue: "llc" } as any,
      b: { key: "country", status: "corrected", currentValue: "CA" } as any,
    });
    expect(c).toEqual({ country: "CA" });
  });
  it("ignores empty or invalid confirmed values", () => {
    expect(effectiveResolverFacts({ profileType: "llc", requestedAmountCents: 1, country: null }, { profile_type: "", commitment_cents: -3 }))
      .toEqual({ profileType: "llc", requestedAmountCents: 1, country: null });
  });
});

describe("document applicability", () => {
  it("empty means all investors", () => { expect(docApplies([], "trust")).toBe(true); expect(docApplies(null, null)).toBe(true); });
  it("entity-specific documents apply only to matching types", () => {
    expect(docApplies(["trust"], "trust")).toBe(true);
    expect(docApplies(["trust"], "individual")).toBe(false);
    expect(docApplies(["llc"], null)).toBe(false);
  });
});

describe("countersign and Action Center", () => {
  const base = { mode: "dual", providerStatus: "in_progress", investorSigned: true, managerSigned: false, countersignerUserId: "m1", viewerUserId: "m1", viewerManagesFund: true };
  it("only the exact signatory sees Your signature required", () => {
    expect(countersignState(base)).toBe("your_signature_required");
    expect(countersignState({ ...base, viewerUserId: "m2" })).toBe("awaiting_fund_manager");
    expect(countersignState({ ...base, viewerManagesFund: false })).toBe("awaiting_fund_manager");
  });
  it("covers not-signed, executed and investor-only", () => {
    expect(countersignState({ ...base, investorSigned: false })).toBe("investor_not_signed");
    expect(countersignState({ ...base, managerSigned: true, providerStatus: "completed" })).toBe("fully_executed");
    expect(countersignState({ ...base, mode: "investor_only" })).toBe("not_dual");
  });
  it("manager list shows the right label", () => {
    const r: any = { investorSigned: true, managerSignatureRequired: true, fullyExecuted: false };
    expect(nextAction({ ...r, managerIsViewer: true })).toBe("Your signature required");
    expect(nextAction({ ...r, managerIsViewer: false })).toBe("Awaiting Fund Manager signature");
  });
  it("re-checks access when an action is opened", () => {
    const a: any = { persona: "fund_manager", fundId: "f1", subjectId: "o1" };
    expect(actionAccessible(a, { ownOnboardings: [], managedFunds: ["f1"], staff: false })).toBe(true);
    expect(actionAccessible(a, { ownOnboardings: [], managedFunds: [], staff: false })).toBe(false);
    expect(actionAccessible({ ...a, persona: "investor" }, { ownOnboardings: ["o1"], managedFunds: [], staff: false })).toBe(true);
  });
  it("action titles never reveal sensitive compliance details", () => {
    expect(titleIsSafe("Review your subscription agreement")).toBe(true);
    expect(titleIsSafe("Upload passport")).toBe(false);
    expect(titleIsSafe("OFAC match")).toBe(false);
  });
});
