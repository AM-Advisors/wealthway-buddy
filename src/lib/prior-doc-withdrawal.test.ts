import { describe, expect, it } from "vitest";
import { withdrawalRefusal, withdrawnPriorDocs } from "./prior-doc-withdrawal";
import { outsideSignedFor } from "./investor-document-review.server";

describe("undoing a loaded signed document", () => {
  it("an undone document counts as withdrawn", () => {
    const w = withdrawnPriorDocs([{ document_id: "oa", action: "withdrawn", created_at: "2026-11-01T00:00:00Z", reason: "Wrong investor" }]);
    expect(w.get("oa")).toEqual({ reason: "Wrong investor", at: "2026-11-01T00:00:00Z" });
  });
  it("a later restore puts it back in use", () => {
    const w = withdrawnPriorDocs([
      { document_id: "oa", action: "withdrawn", created_at: "2026-11-01T00:00:00Z" },
      { document_id: "oa", action: "restored", created_at: "2026-11-02T00:00:00Z" },
    ]);
    expect(w.has("oa")).toBe(false);
  });
  it("undo needs a reason", () => expect(withdrawalRefusal({ action: "withdrawn", reason: " ", replaced: false, withdrawn: false })).toBe("Give a reason for undoing this."));
  it("a replaced document can't be undone", () => expect(withdrawalRefusal({ action: "withdrawn", reason: "x", replaced: true, withdrawn: false })).not.toBeNull());
  it("undo with a reason is allowed", () => expect(withdrawalRefusal({ action: "withdrawn", reason: "Uploaded by mistake", replaced: false, withdrawn: false })).toBeNull());
  it("an undone operating agreement no longer shows as signed in Approvals", () => {
    const rows = [{ id: "oa", onboarding_id: "ob", document_kind: "operating_agreement", signed_on: "2025-10-21", replaces_id: null }];
    expect(outsideSignedFor(rows, "ob", "operating_agreement", new Set(["oa"]))).toBeNull();
    expect(outsideSignedFor(rows, "ob", "operating_agreement")).toEqual({ signedOn: "2025-10-21" });
  });
});
