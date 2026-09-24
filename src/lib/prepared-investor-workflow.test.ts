import { describe, expect, it } from "vitest";
import {
  affectedRequirements, assertConfirmable, deriveActions, initialProvenance, investorReviewView, isStale, managerSafeRow,
  mergeDocument, nextAction, reconcileActions, regenerate, requiredMergeFields, requirementDelta, reviewField, signingHandoffBlocker,
} from "@/lib/prepared-investor-workflow";
import { reconcileDocuments } from "@/lib/investor-prep-model";
import { signingStage } from "@/lib/fund-onboarding-model";

const prov = initialProvenance({
  legal_name: { value: "Jane Smith", state: "prepared", source: "fund_manager" },
  phone: { value: "555", state: "prepared", source: "fund_manager" },
  external_reference: { value: "INT-9", state: "prepared", source: "fund_manager" },
}, "2026-09-01");

describe("prepared investor workflow", () => {
  it("confirmation preserves preparer provenance", () => {
    const r = reviewField(prov.legal_name!, { confirm: true }, "t");
    expect(r.status).toBe("investor_confirmed"); expect(r.preparedBy).toBe("fund_manager"); expect(r.preparedValue).toBe("Jane Smith");
  });
  it("correction keeps old and new values", () => {
    const r = reviewField(prov.legal_name!, { correct: "Jane A. Smith" }, "t");
    expect(r.history).toEqual([{ at: "t", from: "Jane Smith", to: "Jane A. Smith" }]); expect(r.preparedValue).toBe("Jane Smith");
  });
  it("internal-only fields are hidden from the investor", () => {
    expect(JSON.stringify(investorReviewView(prov, "individual"))).not.toContain("INT-9");
  });
  it("compliance facts cannot be confirmed", () => {
    for (const k of ["kyc_status", "accreditation_certified", "funded", "bad_actor_answers"]) expect(assertConfirmable(k).ok).toBe(false);
  });
  it("non-material correction reopens nothing", () => { expect(affectedRequirements(["phone"])).toEqual([]); });
  it("Individual → LLC affects entity, owners, tax and documents", () => {
    const a = affectedRequirements(["profile_type"]);
    for (const k of ["entity_verification", "beneficial_owners", "tax_classification", "subscription_documents"]) expect(a).toContain(k);
    expect(affectedRequirements(["phone"])).not.toContain("accreditation");
  });
  it("signer and tax changes reevaluate the right requirements", () => {
    expect(affectedRequirements(["authorized_signer_name"])).toContain("signature");
    expect(affectedRequirements(["tax_classification"])).toEqual(["tax_classification", "tax_documentation"]);
  });
  it("requirement delta points at the newly added item", () => {
    const d = requirementDelta([{ key: "entity_verification", state: "not_applicable" }], [{ key: "entity_verification", state: "missing" }]);
    expect(d.firstAffected).toBe("entity_verification");
  });
  it("required agreements cannot be removed", () => {
    const docs = [{ id: "a", offering_id: "f", title: "Sub", investor_required: true, requires_signature: true, signing_mode: "", template_ready: true }];
    const r = reconcileDocuments("f", docs, []); expect(r.ok && r.selected[0]!.documentId).toBe("a");
  });
  it("merge uses confirmed data and never mutates the profile", () => {
    const profile = { legal_name: "Jane" }; const frozen = JSON.stringify(profile);
    const m = mergeDocument({ profile, investment: { commitment_cents: 5000000 }, fund: { name: "Fund I" }, effectiveDate: "2026-09-24" }, requiredMergeFields("individual", "investor_only"));
    expect(m.values["investor_legal_name"]).toBe("Jane"); expect(m.sources["commitment_amount"]).toBe("investment");
    expect(JSON.stringify(profile)).toBe(frozen); expect(m.missing).toEqual([]);
  });
  it("missing merge data blocks signing", () => {
    const m = mergeDocument({ profile: {}, investment: {}, fund: { name: "F" }, effectiveDate: "d" }, requiredMergeFields("llc", "investor_only"));
    expect(m.missing.map((x) => x.message)).toContain("Authorized signer title is required.");
    expect(signingHandoffBlocker(null, m.values, m.missing)).toBe("Document needs information");
  });
  it("stale documents cannot proceed; regeneration keeps history; review required", () => {
    const base = { documentId: "d", templateRef: "t", profileFingerprint: "x", mergeValues: { a: "1" }, signingMode: "investor_only" };
    const h = regenerate([], base); expect(signingHandoffBlocker(h[0]!, { a: "1" }, [])).toMatch(/review/);
    expect(isStale(h[0]!, { a: "2" })).toBe(true);
    expect(signingHandoffBlocker({ ...h[0]!, status: "reviewed" }, { a: "2" }, [])).toBe("Document needs to be regenerated");
    const h2 = regenerate(h, { ...base, mergeValues: { a: "2" } });
    expect(h2).toHaveLength(2); expect(h2[0]!.status).toBe("superseded"); expect(h2[1]!.version).toBe(2);
  });
  it("investor signature alone does not fully execute a dual document", () => {
    expect(signingStage({ mode: "dual", providerStatus: "in_progress", signers: [{ role: "investor", order: 1, status: "signed" }] })).toBe("awaiting_fund_manager");
  });
  it("next action derives from state; managers never mark funded", () => {
    expect(nextAction({ draftOnly: true })).toBe("Send onboarding");
    expect(nextAction({ investorSigned: true, managerSignatureRequired: true })).toBe("Your signature required");
    expect(nextAction({ approvedToFund: true, fundingStatus: "awaiting_wire" })).toBe("Waiting for funding");
    expect(nextAction({ fundingStatus: "funded" })).toBe("Complete");
  });
  it("manager row carries only coarse statuses", () => {
    const r = managerSafeRow({ name: "J", investingAs: "llc", commitmentCents: 1, kycStatus: "approved", amlStatus: "in_review" } as any);
    expect(Object.keys(r)).not.toContain("kycStatus"); expect(r.verification).toBe("Compliance review");
  });
  it("action center is idempotent and preserves persona context", () => {
    const facts = { fundId: "f", fundName: "Fund I",
      myInvestments: [{ onboardingId: "o1", unreviewedPrepared: true, needsInfo: false, identityPending: false, docsToReview: false, docsToSign: false, approvedToFund: false }],
      countersign: [{ onboardingId: "o2", investorName: "Jane Smith", documentTitle: "subscription agreement", iAmSignatory: true }, { onboardingId: "o3", investorName: "X", documentTitle: "s", iAmSignatory: false }] };
    const a = deriveActions(facts); const b = deriveActions(facts);
    expect(a).toEqual(b); expect(a.map((x) => x.persona)).toEqual(["investor", "fund_manager"]);
    const rec = reconcileActions(a.map((x) => x.key), b); expect(rec.create).toEqual([]); expect(rec.resolve).toEqual([]);
    expect(reconcileActions(a.map((x) => x.key), []).resolve).toHaveLength(2);
  });
});
