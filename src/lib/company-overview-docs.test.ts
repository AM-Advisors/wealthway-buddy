import { describe, expect, it } from "vitest";
import { groupDocuments, overviewFigures, ownershipView, planReversal, stakeholderActivity, stakeholderDocuments, toModelTxs, type WsDoc, type WsTx } from "./company-360-views";

const C = "c1";
const tx = (o: Partial<WsTx>): WsTx => ({ id: "t", kind: "issuance", quantity: 100, amount: null, effectiveDate: "2026-01-01", stakeholderId: "a", counterpartyId: null, securityId: "s1", postingStatus: "posted", reversesTransactionId: null, ...o });
const doc = (o: Partial<WsDoc>): WsDoc => ({ id: "d", title: "Doc", docType: "board_consent", purpose: null, status: "active", stakeholderId: null, securityId: null, transactionId: null, roundId: null, uploadedBy: "u", createdAt: "2026-01-01", updatedAt: "2026-01-01", ...o });
const secs = [{ id: "s1", className: "Common", securityType: "common" }];
const shs = [{ id: "a", name: "A", type: "individual", email: null }, { id: "b", name: "B", type: "individual", email: null }];

describe("company overview", () => {
  it("derives figures from finalized transactions only", () => {
    const txs = [tx({ id: "1" }), tx({ id: "2", stakeholderId: "b", postingStatus: "draft" })];
    const v = ownershipView(C, toModelTxs(C, txs, secs), shs);
    const f = overviewFigures(v, txs, [{ status: "missing" }], 1);
    expect(f.issued).toBe(100); expect(f.pending).toBe(1); expect(f.stakeholders).toBe(1); expect(f.docIssues).toBe(1); expect(f.latest?.id).toBe("1");
  });
  it("legacy negative cancellations still reduce holdings", () => {
    const txs = [tx({ id: "1" }), tx({ id: "2", kind: "cancellation", quantity: -30 })];
    expect(ownershipView(C, toModelTxs(C, txs, secs), shs).summary.outstanding).toBe(70);
  });
});

describe("reversal", () => {
  const orig = { id: "o", company_id: C, security_id: "s1", stakeholder_id: "a", kind: "issuance", quantity: 100, amount: null, posting_status: "posted", reverses_transaction_id: null };
  const req = { companyId: C, effectiveDate: "2026-02-01", reason: "Entered twice", correctionType: "full_reversal" };
  it("creates a linked new record and leaves the original untouched", () => {
    const snapshot = JSON.stringify(orig);
    const r = planReversal(orig, req);
    expect(r.ok && r.row['reverses_transaction_id']).toBe("o");
    expect(JSON.stringify(orig)).toBe(snapshot);
  });
  it("refuses drafts, other companies and reversals of reversals", () => {
    expect(planReversal({ ...orig, posting_status: "draft" }, req).ok).toBe(false);
    expect(planReversal({ ...orig, company_id: "x" }, req).ok).toBe(false);
    expect(planReversal({ ...orig, reverses_transaction_id: "z" }, req).ok).toBe(false);
  });
  it("reversed transaction no longer counts", () => {
    const txs = [tx({ id: "1" }), tx({ id: "2", kind: "reversal", reversesTransactionId: "1" })];
    expect(ownershipView(C, toModelTxs(C, txs, secs), shs).summary.outstanding).toBe(0);
  });
});

describe("documents and activity", () => {
  it("keeps one canonical document even with duplicate relationships", () => {
    const g = groupDocuments([doc({ id: "x" }), doc({ id: "x", stakeholderId: "a" }), doc({ id: "y", docType: "409a_report" })]);
    expect(g.Corporate.length).toBe(1); expect(g["Valuation & Tax"].length).toBe(1);
  });
  it("stakeholder documents are only theirs", () => {
    const txs = [tx({ id: "1", securityId: "s9" })];
    const d = stakeholderDocuments("a", [doc({ id: "1", stakeholderId: "a" }), doc({ id: "2", transactionId: "1" }), doc({ id: "3", stakeholderId: "b" })], txs);
    expect(d.map((x) => x.id).sort()).toEqual(["1", "2"]);
  });
  it("activity is scoped to the stakeholder", () => {
    const ev = [{ id: "e1", action: "transaction.issuance", entityType: "transaction", entityId: "1", reason: null, occurredAt: "2026-01-01" },
      { id: "e2", action: "company.update", entityType: "company", entityId: C, reason: null, occurredAt: "2026-01-02" }];
    expect(stakeholderActivity("a", ev, ["1"], [], []).map((e) => e.id)).toEqual(["e1"]);
  });
});
import { resolveHelp } from "./help-content";
describe("help keys used on company screens", () => {
  it("all resolve from the central registry", () => {
    for (const k of ["authorized_shares", "outstanding_shares", "fully_diluted", "stakeholder", "reversal", "as_of_date"]) expect(resolveHelp(k)).not.toBeNull();
  });
});
