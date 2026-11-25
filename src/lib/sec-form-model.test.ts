import { describe, it, expect } from "vitest";
import { normalizeCik, isAccession, prepareFiling } from "./sec-form-model";
const base = { name: "F", cik: "0001234567", address: "a", state: "DE", entityType: "llc", dateFormed: "2026-01-01", regType: "506c", maxOfferingCents: 1, firstSaleOn: "2026-02-01", signer: "s", soldCents: 0, investors: 0, accredited: 0 };
describe("sec form model", () => {
  it("pads CIK to 10 digits and rejects too long", () => { expect(normalizeCik("1234567")).toBe("0001234567"); expect(normalizeCik("12345678901")).toBeNull(); });
  it("accepts SEC accession format only", () => { expect(isAccession("0001234567-26-000123")).toBe(true); expect(isAccession("1234567-26-123")).toBe(false); });
  it("506(c) prepares Form D, then Form D/A once filed", () => { expect(prepareFiling(base, []).form).toBe("Form D"); expect(prepareFiling(base, ["Form D"]).form).toBe("Form D/A"); });
  it("Reg CF prepares Form C", () => { expect(prepareFiling({ ...base, regType: "regcf" }, []).form).toBe("Form C"); });
  it("lists missing CIK and first sale", () => { expect(prepareFiling({ ...base, cik: null, firstSaleOn: null }, []).missing).toEqual(["CIK", "Date of first sale"]); });
});
