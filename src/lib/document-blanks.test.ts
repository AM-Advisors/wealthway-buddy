import { describe, expect, it } from "vitest";
import { leftoverBlanks, leftoverBlanksError } from "./document-blanks";

describe("leftover document blanks", () => {
  it("a memorandum with {{Fund Term}} and an empty {{}} cannot be approved", () => {
    const blanks = leftoverBlanks('"Term" means the {{Fund Term}} anniversary. Tel: {{}}', "ppm");
    expect(blanks).toEqual(["{{Fund Term}}", "an empty {{ }}"]);
    expect(leftoverBlanksError(blanks)).toContain("{{Fund Term}}");
  });
  it("subscription signing fields are filled at signing, but fund details are not", () => {
    expect(leftoverBlanks("{{Date}} {{Signature}} {{Signatory’s Title}} {{Arbitration City}}", "subscription_agreement")).toEqual(["{{Arbitration City}}"]);
  });
  it("signing words are still blanks outside subscription agreements", () => {
    expect(leftoverBlanks("{{signatory title}}", "operating_agreement")).toEqual(["{{signatory title}}"]);
  });
  it("a clean document passes", () => expect(leftoverBlanksError(leftoverBlanks("Term means the seventh anniversary.", "ppm"))).toBeNull());
});
