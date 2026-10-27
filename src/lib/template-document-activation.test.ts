import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reviewState: null as string | null, staff: false, funds: ["fund-1"], templateVersion: 1, approved: true, signing: "confirmed", updates: [] as string[],
}));
vi.mock("@/lib/fund-setup.server", () => ({
  setupActor: async () => ({ isStaff: state.staff, offeringIds: state.funds }),
  forbid: (message: string) => { throw new Error(message); },
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const tables: Record<string, any[]> = {
      offering_documents: [{ id: "doc-1", offering_id: "fund-1", current_version: 1, active_version: null, usage: "signature" }],
      offering_document_versions: [{ id: "version-1", version: 1, self_serve_review_state: state.reviewState, approval_status: state.reviewState === "approved" ? "approved" : "uploaded_review_required", signing_config_status: state.signing, signing_config: { signers: [{ role: "investor" }] }, file_path: "fund-1/template.docx" }],
      document_template_uses: [{ offering_document_id: "doc-1", fund_version: state.templateVersion, template_id: "template-1", template_version: 1 }],
      document_template_versions: state.approved ? [{ template_id: "template-1", version: 1, status: "approved" }] : [],
    };
    const rows = tables[table] ?? [];
    const query: any = {
      select: () => query, eq: () => query, in: () => query,
      not: () => ({ then: (resolve: (v: unknown) => unknown) => resolve({ data: state.reviewState ? [{ offering_document_id: "doc-1", version: 1 }] : [], error: null }) }),
      update: () => { state.updates.push(table); return query; },
      insert: () => query,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    return query;
  },
} }));

import { activateDocumentVersion } from "./offering-document-setup.server";

beforeEach(() => {
  Object.assign(state, { reviewState: null, staff: false, funds: ["fund-1"], templateVersion: 1, approved: true, signing: "confirmed", updates: [] });
});
describe("server template activation", () => {
  it("client-generated drafts cannot inherit the library approval exemption", async () => {
    state.reviewState = "pending";
    await expect(activateDocumentVersion("manager-1", { documentId: "doc-1", version: 1 })).rejects.toThrow("approve this draft");
    expect(state.updates).toHaveLength(0);
  });
  it("reviewed client-generated versions use the existing activation engine", async () => {
    state.reviewState = "approved";
    await expect(activateDocumentVersion("manager-1", { documentId: "doc-1", version: 1, scope: "new_only" })).resolves.toEqual({ ok: true, resign: 0 });
    expect(state.updates).toContain("offering_documents");
  });
  it("lets that fund's manager activate its approved-template copy without staff approval", async () => {
    await expect(activateDocumentVersion("manager-1", { documentId: "doc-1", version: 1, scope: "new_only" })).resolves.toEqual({ ok: true, resign: 0 });
    expect(state.updates).toContain("offering_documents");
  });
  it("refuses another fund's manager", async () => {
    state.funds = ["fund-2"];
    await expect(activateDocumentVersion("manager-2", { documentId: "doc-1", version: 1 })).rejects.toThrow("you do not manage that fund");
    expect(state.updates).toHaveLength(0);
  });
  // Managers approve their own custom uploads by putting them in use, but only
  // once the fund's legal name is confirmed; nothing is written before that.
  it("a later custom upload goes through the manager self-approval gate", async () => {
    state.templateVersion = 2;
    await expect(activateDocumentVersion("manager-1", { documentId: "doc-1", version: 1 })).rejects.toThrow("Legal Name");
    expect(state.updates).toHaveLength(0);
  });
  it("an unapproved source template is treated as a custom upload", async () => {
    state.approved = false;
    await expect(activateDocumentVersion("manager-1", { documentId: "doc-1", version: 1 })).rejects.toThrow("Legal Name");
    expect(state.updates).toHaveLength(0);
  });
  it("keeps the signing-setup guard", async () => {
    state.signing = "needs_review";
    await expect(activateDocumentVersion("manager-1", { documentId: "doc-1", version: 1 })).rejects.toThrow("Confirm the signing setup");
    expect(state.updates).toHaveLength(0);
  });
});