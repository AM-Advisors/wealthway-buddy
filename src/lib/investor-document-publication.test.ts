import { describe, expect, it } from "vitest";
import { investorDocumentPublication } from "./investor-document-publication";
import { documentPublicationFor } from "./investor-document-publication.server";

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
  it("exact approved-template provenance satisfies review without a second approval", () => {
    expect(investorDocumentPublication({ ...base, approval: "uploaded_review_required", approvedTemplate: true }).ready).toBe(true);
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

function database(versions: any[], error: unknown = null) {
  return { from: () => ({ select: () => ({ in: async (_column: string, ids: string[]) => ({ data: versions.filter((v) => ids.includes(v.offering_document_id)), error }) }) }) };
}
const doc = { id: "doc", active_version: 1, usage: "signature", requires_signature: true };
const versions = [
  { offering_document_id: "doc", version: 1, approval_status: "approved", signing_config_status: "confirmed" },
  { offering_document_id: "doc", version: 2, approval_status: "uploaded_review_required", signing_config_status: "needs_review" },
];
describe("applicable document publication", () => {
  it("a newer draft does not change active document readiness", async () => {
    expect((await documentPublicationFor(database(versions), [doc], "investor")).get("doc")?.ready).toBe(true);
  });
  it("keeps another investor's individual version out", async () => {
    const individual = { ...versions[0], version: 3, rollout_scope: "single", target_onboarding_id: "other", signing_config_status: "needs_review" };
    expect((await documentPublicationFor(database([...versions, individual]), [doc], "investor")).get("doc")?.ready).toBe(true);
    expect((await documentPublicationFor(database([...versions, individual]), [doc], "other")).get("doc")?.ready).toBe(false);
  });
  it("retains the investor's original executed version", async () => {
    const rows = [{ ...versions[0], approval_status: "superseded" }, { ...versions[1], approval_status: "approved" }];
    const result = await documentPublicationFor(database(rows), [{ ...doc, active_version: 2 }], "investor", [{ offering_document_id: "doc", signature_template_version: 1 }]);
    expect(result.get("doc")?.ready).toBe(true);
  });
  it("missing version evidence is not ready", async () => {
    expect((await documentPublicationFor(database([]), [doc], "investor")).get("doc")?.ready).toBe(false);
  });
  it("failed version reads never return a ready state", async () => {
    await expect(documentPublicationFor(database(versions, { message: "failed" }), [doc], "investor")).rejects.toThrow("could not be loaded");
  });
});