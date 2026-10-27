import { describe, expect, it } from "vitest";
import { importContactDecision } from "./crm-import-contact-model";
describe("reviewed imported contact matching", () => {
  it("preserves an explicitly linked source", () => expect(importContactDecision("existing", [])).toEqual({ kind: "linked", contactId: "existing" }));
  it("does not silently merge a matching email", () => expect(importContactDecision(null, [{ id: "other", full_name: "Fictional Contact", email: "contact@example.test" }])).toEqual({ kind: "review", contactId: null }));
  it("allows a new record only without matches", () => expect(importContactDecision(null, [])).toEqual({ kind: "new", contactId: null }));
});