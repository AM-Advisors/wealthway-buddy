import { describe, it, expect } from "vitest";
import { investorSideLetterLabels } from "./investor-extras.server";
describe("investor side letter labels", () => {
  it("never shows storage paths and hides proposed letters", () => {
    const out = investorSideLetterLabels([
      { status: "proposed", document_reference: "side-letters/a/b.pdf" },
      { status: "active", document_reference: "side-letters/a/c.pdf" },
    ]);
    expect(out).toEqual(["Side letter · Active"]);
  });
});
