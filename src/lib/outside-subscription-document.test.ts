import { describe, expect, it } from "vitest";
import { outsideSignedLabel, outsideSignedOn } from "./outside-subscription-document";

const sub = { document_category: "subscription_agreement" };
const complete = { marked: true, signedOn: "2026-10-09", copyLoaded: true, complete: true };

describe("outside-signed Subscription Agreement", () => {
  it("counts as completed once Harmonious marked it and loaded the copy", () => {
    expect(outsideSignedOn(sub, complete)).toBe("2026-10-09");
    expect(outsideSignedOn({ doc_type: "subscription_agreement" }, complete)).toBe("2026-10-09");
  });
  it("stays open when marked without a Harmonious-held copy", () => {
    expect(outsideSignedOn(sub, { marked: true, signedOn: "2026-10-09", copyLoaded: false, complete: false })).toBeNull();
  });
  it("never completes other documents", () => {
    expect(outsideSignedOn({ doc_type: "wire_form" }, complete)).toBeNull();
    expect(outsideSignedOn({ document_category: "operating_agreement" }, complete)).toBeNull();
  });
  it("labels the signed date", () => {
    expect(outsideSignedLabel("2026-10-09")).toBe("Signed outside the platform on Oct 9, 2026");
  });
});
