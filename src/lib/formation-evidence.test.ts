import { describe, expect, it } from "vitest";
import { hasFormationEvidence } from "./fund-formation";

describe("single formation document requirement", () => {
  it("accepts a formation document without a second certificate upload", () => {
    expect(hasFormationEvidence({ formationDocumentId: "formation-1" })).toBe(true);
  });
  it("accepts an existing certificate without another formation upload", () => {
    expect(hasFormationEvidence({ certificateDocumentId: "certificate-1" })).toBe(true);
  });
  it("still requires a document", () => {
    expect(hasFormationEvidence({ formationDocumentId: null, certificateDocumentId: null })).toBe(false);
  });
});