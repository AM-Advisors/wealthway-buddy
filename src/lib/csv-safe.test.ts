import { describe, expect, it } from "vitest";
import { csvSafeCell, neutralizeCsvText } from "./csv-safe";

describe("spreadsheet-safe CSV cells", () => {
  it("neutralizes formula-leading text", () => {
    for (const v of ["=HYPERLINK(\"x\")", "+1+1", "-cmd", "@SUM(A1)", "\tx", "\rx"]) expect(neutralizeCsvText(v).startsWith("'")).toBe(true);
  });
  it("leaves plain values and numbers alone, and quotes cells", () => {
    expect(neutralizeCsvText("Jane Doe")).toBe("Jane Doe");
    expect(neutralizeCsvText("-12.50")).toBe("-12.50");
    expect(neutralizeCsvText(-3)).toBe("-3");
    expect(neutralizeCsvText(null)).toBe("");
    expect(csvSafeCell('a "b"')).toBe('"a ""b"""');
    expect(csvSafeCell("=1+1")).toBe('"\'=1+1"');
  });
});
