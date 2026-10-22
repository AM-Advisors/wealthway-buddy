import { describe, expect, it } from "vitest";
import { responseAllowed, responseDraft, responseProjection, type ResponseEvent } from "./sales-response-model";
const event = (name: string, detail: Record<string, unknown>, day = "01"): ResponseEvent => ({ event: name, detail, created_at: `2026-10-${day}T12:00:00Z` });
describe("client response rules", () => {
  it("keeps recipient responses private and version-specific", () => {
    const result = responseProjection([
      event("response_sent", { version: 2, recipient: "one@example.test", message: "One" }),
      event("response_sent", { version: 2, recipient: "two@example.test", message: "Two" }),
      event("response_sent", { version: 1, recipient: "one@example.test", message: "Old" }),
    ], 2, false, true, "one@example.test");
    expect(result.messages.map((m) => m.message)).toEqual(["One"]);
  });
  it("records changes without counting them as signing", () => {
    expect(responseProjection([event("client_changes_requested", { version: 2, message: "Adjust scope" })], 2, false, true).status).toBe("changes_requested");
  });
  it("review remains distinct from a signature", () => {
    expect(responseProjection([event("client_reviewed", { version: 2 })], 2, false, true).status).toBe("reviewed");
  });
  it("recorded signature wins over earlier response status", () => {
    expect(responseProjection([event("client_changes_requested", { version: 2 })], 2, true, true).status).toBe("signed");
  });
  it("failed or pending emails never appear as sent client responses", () => {
    expect(responseProjection([event("response_pending", { version: 2, message: "Pending" }), event("response_failed", { version: 2, message: "Failed" })], 2, false, true).messages).toEqual([]);
  });
  it("uses latest instructions only from the requested version", () => {
    expect(responseProjection([event("response_instructions", { version: 2, instructions: "Old" }), event("response_instructions", { version: 2, instructions: "New" }, "02"), event("response_instructions", { version: 3, instructions: "Other" }, "03")], 2, false, false).instructions).toBe("New");
  });
  it("refuses feedback on stale, signed or unapproved records", () => {
    expect(responseAllowed("sent", 2, 1, false)).toBe(false);
    expect(responseAllowed("sent", 2, 2, true)).toBe(false);
    expect(responseAllowed("draft", 2, 2, false)).toBe(false);
    expect(responseAllowed("approved", 2, 2, false)).toBe(true);
  });
  it("requires a real recipient and nonempty response within limits", () => {
    const valid = { instructions: "Review scope", message: "Your requested details", recipient: "one@example.test", requestId: "00000000-0000-4000-8000-000000000001" };
    expect(responseDraft.safeParse(valid).success).toBe(true);
    expect(responseDraft.safeParse({ ...valid, message: " " }).success).toBe(false);
    expect(responseDraft.safeParse({ ...valid, recipient: "not an email" }).success).toBe(false);
    expect(responseDraft.safeParse({ ...valid, instructions: "x".repeat(2001) }).success).toBe(false);
  });
});