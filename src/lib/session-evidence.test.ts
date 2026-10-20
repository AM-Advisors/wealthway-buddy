import { describe, expect, it } from "vitest";
import { browserErrorCategory, evidencePath, signInEvidenceKey } from "./session-evidence";

describe("session security evidence", () => {
  it("never retains invitation tokens or URL secrets", () => {
    expect(evidencePath("/invite/private-token?email=private@example.com#access_token=secret")).toBe("/invite/:record");
  });
  it("redacts investment IDs but retains the page shape", () => {
    expect(evidencePath("/investment/fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f/documents")).toBe("/investment/:record/documents");
  });
  it("does not record arbitrary error names or messages", () => {
    expect(browserErrorCategory("rejection", "SSN 123-45-6789")).toBe("Browser-reported unhandled rejection");
  });
  it("links duplicate sign-in observations to the same authenticated session", () => {
    expect(signInEvidenceKey("user-a", "session-a")).toBe("user-a:session-a:sign_in");
    expect(signInEvidenceKey("user-a", "session-b")).not.toBe(signInEvidenceKey("user-a", "session-a"));
  });
});