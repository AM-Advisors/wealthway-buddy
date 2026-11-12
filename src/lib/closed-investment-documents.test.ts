import { describe, expect, it } from "vitest";
import { closedDocumentDetail, closedDocumentStatus } from "./closed-investment-documents";

describe("closed investment documents", () => {
  it("shows an outside-signed Subscription Agreement as signed, with its recorded date", () => {
    const s = closedDocumentStatus({ requiresSignature: true, platformSignedAt: null, executed: false, outsideSignedOn: "2026-11-09" });
    expect(s).toBe("signed_outside");
    expect(closedDocumentDetail(s, { platformSignedAt: null, outsideSignedOn: "2026-11-09" })).toContain("Nov 9, 2026");
  });

  it("never offers signing: an unsigned required document reads as no signature on file", () => {
    expect(closedDocumentStatus({ requiresSignature: true, platformSignedAt: null, executed: false, outsideSignedOn: null })).toBe("no_signature_on_file");
  });

  it("does not call a document signed without a recorded signature", () => {
    expect(closedDocumentStatus({ requiresSignature: false, platformSignedAt: null, executed: false, outsideSignedOn: null })).toBe("reference");
  });

  it("uses the platform signature when one exists", () => {
    expect(closedDocumentStatus({ requiresSignature: true, platformSignedAt: "2026-10-01T15:00:00Z", executed: false, outsideSignedOn: "2026-11-09" })).toBe("signed");
  });
});
