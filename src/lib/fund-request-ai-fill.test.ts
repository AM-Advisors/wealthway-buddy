import { describe, expect, it } from "vitest";
import { applySuggestions, requestDocKindFor, requestSuggestions } from "@/lib/fund-request-ai-fill";
import { emptyRequest } from "@/lib/fund-request-model";
import type { FundDocReading } from "@/lib/fund-doc-extract-model";

const reading = (fields: FundDocReading["fields"], documentKind: FundDocReading["documentKind"] = "operating_agreement"): FundDocReading => ({ documentKind, fields, notes: [] });

describe("new fund request AI fill", () => {
  it("converts document values into the form's own format", () => {
    const s = requestSuggestions(emptyRequest(), [{ fileName: "OA.pdf", reading: reading({
      legalName: { value: "Acme Fund I, LLC", page: 1 }, entityType: { value: "Delaware limited liability company", page: 1 },
      jurisdiction: { value: "DE", page: 1 }, minInvestmentCents: { value: "2500000", page: 3 }, managementFeePercent: { value: "2", page: 4 },
      fundTermMonths: { value: "120", page: 5 },
    }) }]);
    const v = Object.fromEntries(s.map((x) => [x.key, x.value]));
    expect(v).toMatchObject({ legal_name: "Acme Fund I, LLC", vehicle_structure: "LLC", jurisdiction: "Delaware", minimum_investment: "25000", management_fee: "2%", fund_term: "10 years" });
  });
  it("marks answers already typed as different and leaves out matching ones", () => {
    const r = { ...emptyRequest("spv"), management_fee: "2%", carried_interest: "15%" };
    const s = requestSuggestions(r, [{ fileName: "OA.pdf", reading: reading({ managementFeePercent: { value: "2", page: 1 }, carryPercent: { value: "20", page: 1 } }) }]);
    expect(s.map((x) => [x.key, x.status, x.current])).toEqual([["carried_interest", "different", "15%"]]);
  });
  it("applies only what was chosen and records a formation date as formed", () => {
    const next = applySuggestions(emptyRequest("spv"), [{ key: "date_formed", value: "2025-03-01" }, { key: "signatory_name", value: "Jane Doe" }]);
    expect(next.date_formed).toBe("2025-03-01");
    expect(next.already_formed).toBe("yes");
    expect(next.signatory.name).toBe("Jane Doe");
    expect(next.carried_interest).toBe("");
  });
  it("files EIN letters and formation papers on the entity list", () => {
    expect(requestDocKindFor("ein_letter", { vehicle_structure: "LLC" })).toBe("IRS EIN letter");
    expect(requestDocKindFor("formation_certificate", { vehicle_structure: "LLC" })).toBe("Formation document");
    expect(requestDocKindFor("ppm", { vehicle_structure: "LLC" })).toBe("PPM");
  });
});
