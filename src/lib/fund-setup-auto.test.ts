import { describe, expect, it } from "vitest";
import { autoCompletedKeys, seriesMasterName } from "./fund-setup-model";

describe("fund setup auto-completion", () => {
  it("series under a master completes formation and registered agent", () => {
    expect(seriesMasterName("CORPS EREBOR, A series of AM SPV Fund Management LLC")).toBe("AM SPV Fund Management LLC");
    expect(autoCompletedKeys({ seriesMaster: "AM SPV", hasEin: false, hasWire: false }).tasks).toEqual(["entity_formation", "entity_registered_agent"]);
  });
  it("standalone fund does not auto-complete formation", () => {
    expect(autoCompletedKeys({ seriesMaster: null, hasEin: false, hasWire: false }).tasks).toEqual([]);
  });
  it("entered EIN completes EIN task", () => {
    expect(autoCompletedKeys({ seriesMaster: null, hasEin: true, hasWire: false }).tasks).toEqual(["entity_ein"]);
  });
  it("entered wire instructions complete bank account", () => {
    const r = autoCompletedKeys({ seriesMaster: null, hasEin: false, hasWire: true });
    expect(r.tasks).toEqual(["banking_account"]);
    expect(r.conditions).toEqual(["banking_active"]);
  });
});

import { derivedRegulatoryAndEligibility } from "./fund-setup-model";
describe("regulatory -> eligibility", () => {
  it("506(b) allows up to 35 sophisticated non-accredited, uses fund minimum, Form D at close", () => {
    const d = derivedRegulatoryAndEligibility("506b", 50000000)!;
    expect(d.rules.max_non_accredited).toBe(35);
    expect(d.rules.min_investment_cents).toBe(50000000);
    expect(d.selections.form_d).toBe("determined_at_close");
  });
  it("506(c) requires accredited investors", () => {
    expect(derivedRegulatoryAndEligibility("506c", null)!.rules.accredited_required).toBe(true);
  });
});
