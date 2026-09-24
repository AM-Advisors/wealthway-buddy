import { describe, expect, it } from "vitest";

import { canEditCompany, canEditTransaction, holdingsFor, summarize, type Tx, documentPurpose } from "@/lib/company-360-model";
import {
  applyInvestorReview, defaultDocuments, mergeFields, reconcileDocuments, sendBlockers, toPreparedFields,
  validatePrepFields, type FundDocument,
} from "@/lib/investor-prep-model";

const tx = (o: Partial<Tx>): Tx => ({
  id: Math.random().toString(), company_id: "A", kind: "issuance", quantity: 100, effective_date: "2026-01-01",
  stakeholder_id: "s1", counterparty_stakeholder_id: null, security_class: "Common", instrument: "share",
  posting_status: "posted", ...o,
});

describe("Company 360", () => {
  it("creating a stakeholder alone creates no ownership", () => {
    expect(holdingsFor("new", [tx({})], "A")).toEqual([]);
  });
  it("posted issuance changes ownership; drafts don't", () => {
    const s = summarize([tx({}), tx({ quantity: 50, posting_status: "draft" })], { companyId: "A" });
    expect(s.outstanding).toBe(100);
    expect(s.pending).toBe(1);
  });
  it("posted transactions cannot be edited; reversals remove them", () => {
    const t = tx({ id: "t1" });
    expect(canEditTransaction(t)).toBe(false);
    expect(summarize([t, tx({ reverses_transaction_id: "t1" })], { companyId: "A" }).outstanding).toBe(0);
  });
  it("company A data never appears in company B", () => {
    expect(summarize([tx({})], { companyId: "B" }).outstanding).toBe(0);
  });
  it("fully diluted includes options; outstanding doesn't; as-of respects dates", () => {
    const txs = [tx({}), tx({ instrument: "option", quantity: 25, stakeholder_id: "s2" }), tx({ effective_date: "2026-06-01", quantity: 10 })];
    const s = summarize(txs, { companyId: "A", asOf: "2026-03-01" });
    expect(s.outstanding).toBe(100);
    expect(s.fullyDiluted).toBe(125);
  });
  it("transfers move shares between stakeholders", () => {
    const s = summarize([tx({}), tx({ kind: "transfer", quantity: 40, stakeholder_id: "s2", counterparty_stakeholder_id: "s1" })], { companyId: "A" });
    expect(s.byStakeholder.find((r) => r.key === "s2")?.quantity).toBe(40);
  });
  it("fund manager relationship alone grants no company edit", () => {
    expect(canEditCompany({ companyAdmin: false, staffCapTableEdit: false, managesFundHolding: true })).toBe(false);
    expect(canEditCompany({ companyAdmin: true, staffCapTableEdit: false, managesFundHolding: false })).toBe(true);
  });
  it("documents are grouped by purpose", () => {
    expect(documentPurpose("409a_report")).toBe("valuation_tax");
    expect(documentPurpose("board_consent")).toBe("corporate");
  });
});

const doc = (o: Partial<FundDocument>): FundDocument => ({
  id: "d1", offering_id: "F1", title: "Subscription Agreement", investor_required: true,
  requires_signature: true, signing_mode: "investor_only", template_ready: true, ...o,
});
const docs = [doc({}), doc({ id: "d2", title: "Side Letter", investor_required: false }), doc({ id: "x", offering_id: "F2", investor_required: false })];

describe("Investor preparation", () => {
  it("required documents preselect", () => {
    expect(defaultDocuments(docs)).toEqual([{ documentId: "d1", requirement: "required" }]);
  });
  it("mandatory documents cannot be removed and optional can be added", () => {
    const r = reconcileDocuments("F1", docs.filter((d) => d.offering_id === "F1"), [{ documentId: "d2", requirement: "optional" }]);
    expect(r.ok && r.selected.map((s) => s.documentId)).toEqual(["d1", "d2"]);
  });
  it("another fund's agreement is rejected", () => {
    expect(reconcileDocuments("F1", docs, [{ documentId: "x", requirement: "optional" }]).ok).toBe(false);
  });
  it("preparers cannot certify KYC/AML/accreditation/tax/funding", () => {
    for (const k of ["kyc_approved", "aml_status", "accreditation_certified", "w9_certified", "funded", "bad_actor_answers"]) {
      expect(validatePrepFields({ [k]: true }).ok).toBe(false);
    }
  });
  it("prepared data is never investor-certified", () => {
    expect(toPreparedFields({ entity_name: "Smith Holdings LLC" }, "fund_manager")["entity_name"]?.state).toBe("prepared");
  });
  it("investor confirm vs material correction", () => {
    const f = toPreparedFields({ entity_name: "Smith LLC", phone: "1" }, "harmonious");
    expect(applyInvestorReview(f, "phone", { confirm: true }).recompute).toBe(false);
    const r = applyInvestorReview(f, "entity_name", { correct: "Smith Holdings LLC" });
    expect(r.recompute).toBe(true);
    expect(r.fields["entity_name"]?.state).toBe("investor_confirmed");
  });
  it("merge fields come from profile data", () => {
    const m = mergeFields(toPreparedFields({ legal_name: "Ann Lee", commitment_cents: 5000000 }, "fund_manager"), { name: "Fund I" }, "2026-09-24");
    expect(m.investor_legal_name).toBe("Ann Lee");
    expect(m.commitment_amount).toBe("$50,000.00");
    expect(m.fund_name).toBe("Fund I");
  });
  it("send is blocked when a signature template isn't ready", () => {
    expect(sendBlockers({ email: "a@b.co", docs: [doc({ template_ready: false })], selected: [{ documentId: "d1", requirement: "required" }] }).length).toBe(1);
    expect(sendBlockers({ email: "a@b.co", docs: [doc({})], selected: [{ documentId: "d1", requirement: "required" }] })).toEqual([]);
  });
});
