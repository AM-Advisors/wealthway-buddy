import { describe, expect, it } from "vitest";
import { investorDocumentPublication } from "./investor-document-publication";

const base = { published: true, approval: "approved" as const, usage: "signature" as const, requiresSignature: true, signingStatus: "confirmed" as const };
describe("fund document publication", () => {
  it("marks an approved published signing document ready", () => {
    expect(investorDocumentPublication(base).ready).toBe(true);
  });
  it("approval alone does not publish a signing document", () => {
    expect(investorDocumentPublication({ ...base, published: false }).ready).toBe(false);
  });
  it("unreviewed documents are never ready", () => {
    expect(investorDocumentPublication({ ...base, approval: "uploaded_review_required" }).ready).toBe(false);
  });
  it("signatures require confirmed signing setup", () => {
    expect(investorDocumentPublication({ ...base, signingStatus: "needs_review" }).ready).toBe(false);
  });
  it("reference documents do not need signing setup", () => {
    expect(investorDocumentPublication({ ...base, usage: "reference", signingStatus: "not_configured" }).ready).toBe(true);
  });
  it("a retained superseded signed version remains published", () => {
    expect(investorDocumentPublication({ ...base, approval: "superseded" }).ready).toBe(true);
    expect(investorDocumentPublication({ ...base, approval: "superseded", published: false }).ready).toBe(false);
  });
});