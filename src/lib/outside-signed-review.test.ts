import { describe, it, expect } from "vitest";
import { outsideSignedFor } from "./investor-document-review.server";
const rows = [{ id: "a", onboarding_id: "ob", document_kind: "subscription_agreement", signed_on: "2026-10-09", replaces_id: null }];
describe("outside-signed subscription in Approvals", () => {
  it("shows a loaded copy as signed", () => expect(outsideSignedFor(rows, "ob", "subscription_agreement")).toEqual({ signedOn: "2026-10-09" }));
  it("does not apply to other documents", () => expect(outsideSignedFor(rows, "ob", "operating_agreement")).toBeNull());
  it("does not apply to other investors", () => expect(outsideSignedFor(rows, "x", "subscription_agreement")).toBeNull());
});
