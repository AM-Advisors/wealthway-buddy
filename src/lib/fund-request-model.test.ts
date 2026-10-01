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
    expect(emptyRequest("spv").vehicle_structure).toBe("Delaware LLC");
    expect(emptyRequest("venture_capital").vehicle_structure).toBe("Delaware LP");
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
    expect(flatAnswers(filled()).signatory).toContain("jane@example.com");
  });
});
