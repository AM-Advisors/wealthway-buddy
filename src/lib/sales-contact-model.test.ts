import { describe, expect, it } from "vitest";
import { canAddSalesContact } from "./sales-contact-model";

describe("missing Sales recipient", () => {
  it("allows a missing contact on an approved quote ready to send", () => {
    expect(canAddSalesContact(null, "approved")).toBe(true);
  });
  it("does not replace an existing contact", () => {
    expect(canAddSalesContact("existing-contact", "approved")).toBe(false);
  });
  it("preserves recipients after sending and signing", () => {
    for (const status of ["sent", "signed", "superseded", "lost", "accepted"]) {
      expect(canAddSalesContact(null, status)).toBe(false);
    }
  });
});