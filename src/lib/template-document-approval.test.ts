import { describe, expect, it } from "vitest";
import { requiresDocumentApproval, versionState } from "./offering-document-model";

describe("Harmonious template fund approval", () => {
  it("waives duplicate Harmonious approval for an approved-template copy", () => {
    expect(requiresDocumentApproval("uploaded_review_required", true)).toBe(false);
    expect(versionState({ approval: "uploaded_review_required", approvedTemplate: true, usage: "signature", signingStatus: "confirmed" })).toBe("ready_for_use");
  });
  it("keeps custom uploads under Harmonious review", () => {
    expect(requiresDocumentApproval("uploaded_review_required", false)).toBe(true);
    expect(versionState({ approval: "uploaded_review_required", usage: "signature", signingStatus: "confirmed" })).toBe("uploaded_review_required");
  });
  it("still requires confirmed signature setup", () => {
    expect(versionState({ approval: "uploaded_review_required", approvedTemplate: true, usage: "signature", signingStatus: "needs_review" })).toBe("signing_setup_needs_review");
  });
  it("never reactivates a superseded template through the exemption", () => {
    expect(requiresDocumentApproval("superseded", true)).toBe(true);
    expect(versionState({ approval: "superseded", approvedTemplate: true, usage: "signature", signingStatus: "confirmed" })).toBe("superseded");
  });
});