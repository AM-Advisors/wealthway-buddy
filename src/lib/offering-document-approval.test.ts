import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ actor: { isStaff: false, offeringIds: ["fund"] }, approval: "uploaded_review_required", fail: false, writes: [] as any[] }));
vi.mock("@/lib/fund-setup.server", () => ({
  setupActor: async () => state.actor,
  forbid: (message: string) => { throw new Error(message); },
}));
vi.mock("@/lib/legal-name-gate.server", () => ({ assertLegalName: async () => {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    let update: any;
    const api: any = {
      select: () => api,
      eq: () => api,
      update: (payload: any) => { update = payload; return api; },
      insert: async (payload: any) => { state.writes.push({ table, payload }); return { error: null }; },
      maybeSingle: async () => {
        if (update) {
          if (state.fail) return { data: null, error: { message: "failed" } };
          state.writes.push({ table, payload: update });
          return { data: { id: "version" }, error: null };
        }
        return { data: table === "offering_documents" ? { id: "doc", offering_id: "fund" } : { id: "version", version: 2, approval_status: state.approval }, error: null };
      },
    };
    return api;
  },
} }));
import { approveDocumentVersion } from "./offering-document-setup.server";

beforeEach(() => { state.actor = { isStaff: false, offeringIds: ["fund"] }; state.approval = "uploaded_review_required"; state.fail = false; state.writes = []; });
describe("fund manager document approval", () => {
  it("allows the assigned fund manager to approve and records their identity", async () => {
    await approveDocumentVersion("manager", { documentId: "doc", version: 2 });
    expect(state.writes.find((w) => w.table === "offering_document_versions")?.payload.approved_by).toBe("manager");
    expect(state.writes.find((w) => w.table === "offering_document_events")?.payload.event).toBe("version_approved");
    expect(state.writes.some((w) => w.table === "document_signatures")).toBe(false);
  });
  it("refuses a manager of another fund", async () => {
    state.actor.offeringIds = ["other"];
    await expect(approveDocumentVersion("manager", { documentId: "doc", version: 2 })).rejects.toThrow("do not manage");
    expect(state.writes).toHaveLength(0);
  });
  it("does not approve a superseded version", async () => {
    state.approval = "superseded";
    await expect(approveDocumentVersion("manager", { documentId: "doc", version: 2 })).rejects.toThrow("awaiting review");
    expect(state.writes).toHaveLength(0);
  });
  it("never acknowledges a failed approval save", async () => {
    state.fail = true;
    await expect(approveDocumentVersion("manager", { documentId: "doc", version: 2 })).rejects.toThrow("could not be saved");
    expect(state.writes).toHaveLength(0);
  });
});