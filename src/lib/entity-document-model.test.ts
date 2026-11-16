import { describe, expect, it } from "vitest";
import { entityDocPath, pathBelongsTo, safeFileName, sortEntityDocs } from "./entity-document-model";

const E1 = "299b3c67-ec95-4e0a-8b49-621d9462f4ee";

describe("entity documents", () => {
  it("keeps files inside their own company's folder", () => {
    const p = entityDocPath(E1, "abc", "ROAS Capital Management L.L.C. EIN.pdf");
    expect(p).toBe(`entities/${E1}/abc-ROAS_Capital_Management_L.L.C._EIN.pdf`);
    expect(pathBelongsTo(E1, p)).toBe(true);
  });
  it("refuses another company's file or a nested path", () => {
    expect(pathBelongsTo(E1, "entities/other/abc-x.pdf")).toBe(false);
    expect(pathBelongsTo(E1, `entities/${E1}/../other/x.pdf`)).toBe(false);
    expect(pathBelongsTo(E1, `entities/${E1}/sub/x.pdf`)).toBe(false);
  });
  it("cleans file names", () => {
    expect(safeFileName("  ../a b?.pdf")).toBe("a_b_.pdf");
  });
  it("lists formation before tax and governance documents", () => {
    const out = sortEntityDocs([
      { docKind: "operating_agreement", title: "OA" },
      { docKind: "ein_letter", title: "EIN" },
      { docKind: "certificate_of_formation", title: "Cert" },
    ]);
    expect(out.map((d) => d.docKind)).toEqual(["certificate_of_formation", "ein_letter", "operating_agreement"]);
  });
});
