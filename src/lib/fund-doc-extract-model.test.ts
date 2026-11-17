import { describe, expect, it } from "vitest";
import { documentCategoryFor, mergeFundReadings, normalizeFieldValue, normalizeFundReading, redactNumbers } from "@/lib/fund-doc-extract-model";

describe("fund document AI reader rules", () => {
  it("removes account, routing, EIN and SSN numbers from text", () => {
    expect(redactNumbers("Acct 123456789012 ABA 021000021 EIN 12-3456789 SSN 123-45-6789")).not.toMatch(/\d{6,}|\d{2}-\d{7}|\d{3}-\d{2}-\d{4}/);
  });
  it("reads 0.25% as 0.25, not 25", () => {
    expect(normalizeFieldValue("percent", "0.25%")).toBe("0.25");
    expect(normalizeFieldValue("percent", ".25")).toBe("0.25");
  });
  it("reads money and terms", () => {
    expect(normalizeFieldValue("cents", "$250,000")).toBe("25000000");
    expect(normalizeFieldValue("cents", "$20M")).toBe("2000000000");
    expect(normalizeFieldValue("months", "7 years")).toBe("84");
    expect(normalizeFieldValue("fye", "December 31")).toBe("12-31");
  });
  it("flags documents that disagree as a conflict", () => {
    const a = normalizeFundReading({ documentKind: "ppm", fields: { managementFeePercent: { value: "0.25", page: 3 } }, notes: [] });
    const b = normalizeFundReading({ documentKind: "operating_agreement", fields: { managementFeePercent: { value: "2", page: 9 } }, notes: [] });
    const rows = mergeFundReadings([{ fileName: "PPM.pdf", reading: a }, { fileName: "LLOA.pdf", reading: b }], {});
    expect(rows[0]).toMatchObject({ key: "managementFeePercent", status: "conflict" });
  });
  it("marks equal values as already matching and different ones as suggestions", () => {
    const r = normalizeFundReading({ documentKind: "ppm", fields: { carryPercent: { value: "0", page: 1 }, minInvestmentCents: { value: "250000", page: 1 } }, notes: [] });
    const rows = mergeFundReadings([{ fileName: "PPM.pdf", reading: r }], { carryPercent: "0", minInvestmentCents: "10000000" });
    expect(rows.find((x) => x.key === "carryPercent")?.status).toBe("matches");
    expect(rows.find((x) => x.key === "minInvestmentCents")?.status).toBe("suggested");
  });
  it("never offers bank details to save, only as reference", () => {
    const r = normalizeFundReading({ documentKind: "wire_instructions", fields: { bankName: { value: "First Bank", page: 1 } }, notes: [] });
    expect(mergeFundReadings([{ fileName: "wire.pdf", reading: r }], {})[0]?.status).toBe("reference");
    expect(documentCategoryFor("wire_instructions")).toBeNull();
  });
});
