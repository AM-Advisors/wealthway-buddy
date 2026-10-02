import { describe, expect, it } from "vitest";
import { emptyRequest, flatAnswers, missingFields, offeringFieldsFor, setupPrefillFor } from "./fund-request-model";

const filled = () => ({
  ...emptyRequest("venture_capital"),
  fund_name: "Acme Ventures I",
  legal_name: "Acme Ventures I, LP",
  jurisdiction: "Delaware",
  offering_exemption: "506(c)",
  target_raise: "$10,000,000",
  fund_term: "10 years",
  investment_period: "36 months",
  signatory: { name: "Jane Doe", email: "jane@example.com", title: "Managing Member" },
});

describe("fund request", () => {
  it("defaults structure from the type", () => {
    expect(emptyRequest("spv").vehicle_structure).toBe("LLC");
    expect(emptyRequest("venture_capital").vehicle_structure).toBe("LP");
  });
  it("reports missing required answers by step", () => {
    const m = missingFields(emptyRequest());
    expect(m.details).toContain("Fund name");
    expect(m.people).toBeTruthy();
    expect(missingFields(filled())).toEqual({});
  });
  it("maps to a closed fund record", () => {
    const f = offeringFieldsFor(filled());
    expect(f).toMatchObject({ name: "Acme Ventures I", entity_type: "LP", reg_type: "506c", target_raise_cents: 1_000_000_000, state_formed: "Delaware" });
    expect(f).not.toHaveProperty("is_open");
  });
  it("prefills Fund Setup without completing anything", () => {
    const p = setupPrefillFor(filled());
    expect(p.structure).toBe("vc_fund");
    expect(p.fund_term_months).toBe(120);
    expect(p.investment_period_months).toBe(36);
    expect(p.service_providers.source).toBe("client_request");
    expect(JSON.stringify(p)).not.toMatch(/complete/);
  });
  it("flattens answers for the Operations queue", () => {
    expect(flatAnswers(filled())['signatory']).toContain("jane@example.com");
  });
});

import { emptyRequest as _empty, missingFields as _missing, needsSs4 as _needs, seriesJurisdiction as _sj, einPathFor as _ein, ss4For as _ss4, seriesLegalName as _sln } from "@/lib/fund-request-model";
describe("Master LLC, EIN and SS-4", () => {
  const base = () => ({ ..._empty("spv"), fund_name: "Test", vehicle_structure: "Series LLC", jurisdiction: "Texas", offering_exemption: "506(b)", signatory: { name: "A", email: "a@x.co", title: "" } });
  it("maps homes to jurisdictions", () => {
    expect(_sj("hcam_tx")).toBe("Texas"); expect(_sj("hcam_wy")).toBe("Wyoming"); expect(_sj("am_spv")).toBe("Delaware"); expect(_sj("own")).toBeNull();
  });
  it("requires home, fee ack for new, and EIN owner when not formed", () => {
    const r = { ...base(), series_home: "new", already_formed: "no" as const };
    const m = _missing(r).entity!.join("|");
    expect(m).toMatch(/New Series LLC details/); expect(m).toMatch(/\$2,000/); expect(m).toMatch(/obtain the EIN/);
    expect(_ein({ ...r, ein_obtained_by: "client" })).toBe("client");
  });
  it("asks for SS-4 only for formed Harmonious series without EIN", () => {
    const r = { ...base(), series_home: "hcam_tx", already_formed: "yes" as const, has_ein: "no" as const };
    expect(_needs(r)).toBe(true);
    expect(_missing(r).entity!.join("|")).toMatch(/SS-4/);
    expect(_needs({ ...r, series_home: "own" })).toBe(false);
    expect(_ss4({ ...r, ss4: { legal_name: "X", responsible_party_tin: "123" } })).not.toHaveProperty("responsible_party_tin");
  });
  it("names a Harmonious series as 'a series of' the Master LLC", () => {
    expect(_sln({ ...base(), series_home: "hcam_tx" })).toBe("Test, a series of HCAM TX");
    expect(_sln({ ...base(), fund_name: "Acme I", series_home: "am_spv" })).toBe("Acme I, a series of AM SPV Fund Management");
    expect(_sln({ ...base(), series_home: "own" })).toBe("");
    expect(_sln({ ...base(), fund_name: "  ", series_home: "hcam_wy" })).toBe("");
    expect(_sln({ ...base(), vehicle_structure: "LLC", series_home: "hcam_tx" })).toBe("");
  });
  it("labels the missing Master LLC answer", () => {
    expect(_missing({ ...base(), series_home: "" }).entity!.join("|")).toMatch(/Master LLC/);
  });
});
