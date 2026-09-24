import { describe, expect, it } from "vitest";

import { ownershipView, reportHeader, stakeholderTransactions, toModelTxs, type WsTx } from "./company-360-views";

const C = "c1";
const secs = [
  { id: "s1", className: "Common", securityType: "common" },
  { id: "s2", className: "Pool", securityType: "option" },
];
const sh = [
  { id: "a", name: "Ana", type: "founder", email: null },
  { id: "b", name: "Ben", type: "employee", email: null },
  { id: "z", name: "Zed", type: "investor", email: null },
];
const tx = (p: Partial<WsTx>): WsTx => ({
  id: "t", kind: "issuance", quantity: 0, amount: null, effectiveDate: "2025-01-01", stakeholderId: null,
  counterpartyId: null, securityId: "s1", postingStatus: "posted", reversesTransactionId: null, ...p,
});
const txs = [
  tx({ id: "1", stakeholderId: "a", quantity: 800 }),
  tx({ id: "2", stakeholderId: "b", quantity: 200, securityId: "s2", effectiveDate: "2025-06-01" }),
  tx({ id: "3", stakeholderId: "b", quantity: 999, postingStatus: "draft" }),
  tx({ id: "4", stakeholderId: "a", quantity: 100, effectiveDate: "2025-03-01" }),
  tx({ id: "5", stakeholderId: "a", quantity: 100, reversesTransactionId: "4", effectiveDate: "2025-04-01" }),
];

describe("company 360 views", () => {
  const model = toModelTxs(C, txs, secs);
  it("uses finalized transactions and separates outstanding from fully diluted", () => {
    const v = ownershipView(C, model, sh);
    expect(v.summary.outstanding).toBe(800);
    expect(v.summary.fullyDiluted).toBe(1000);
  });
  it("historical as-of excludes later transactions", () => {
    const v = ownershipView(C, model, sh, { asOf: "2025-02-01" });
    expect(v.summary.fullyDiluted).toBe(800);
  });
  it("stakeholder without securities has no ownership", () => {
    const z = ownershipView(C, model, sh).rows.find((r) => r.id === "z")!;
    expect(z.fullyDiluted).toBe(0);
    expect(z.securities).toBe(0);
  });
  it("reversal neutralises original but keeps both in the ledger", () => {
    expect(model.find((t) => t.id === "4")).toBeTruthy();
    expect(ownershipView(C, model, sh).rows.find((r) => r.id === "a")!.outstanding).toBe(800);
  });
  it("stakeholder 360 transactions are only that stakeholder's", () => {
    expect(stakeholderTransactions("b", txs).map((t) => t.id)).toEqual(["2", "3"]);
  });
  it("other companies' transactions never count", () => {
    expect(ownershipView("other", model, sh).summary.fullyDiluted).toBe(0);
  });
  it("report header identifies company, type, as-of and cutoff", () => {
    const h = reportHeader("Acme", "Current Cap Table", "2025-02-01", "2025-06-01");
    expect(h).toMatchObject({ company: "Acme", reportType: "Current Cap Table", asOf: "2025-02-01", dataCutoff: "2025-06-01" });
  });
});
