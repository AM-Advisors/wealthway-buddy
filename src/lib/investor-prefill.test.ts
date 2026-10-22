import { describe, expect, it } from "vitest";
import { fillMissingInvestorAnswers, suppliedInvestorAnswers } from "./subscription-prefill";

describe("previously supplied investor information", () => {
  it("fills only missing information and preserves existing answers", () => {
    expect(fillMissingInvestorAnswers({ city: "Denver", phone: " ", agreed: false, amount: 0 }, { city: "Boston", phone: "555-0100", agreed: true, amount: 10 }, ["city", "phone", "agreed", "amount"])).toEqual({ city: "Denver", phone: "555-0100", agreed: false, amount: 0 });
  });
  it("fills the exact individual's recorded address, birthday and citizenship", () => {
    const result = suppliedInvestorAnswers({ address_line1: "10 Fictional St", city: "Denver", date_of_birth: "1990-01-02", citizenship_country: "US" }, { profile_type: "individual", city: "", address_line1: null });
    expect(result['subscriber_s_address_of_residence']).toBe("10 Fictional St, Denver");
    expect(result['date_of_birth']).toBe("1990-01-02");
    expect(result['citizenship']).toBe("US");
  });
  it("never substitutes signer details for an entity or joint investing party", () => {
    for (const type of ["llc", "joint"]) {
      const result = suppliedInvestorAnswers({ address_line1: "Signer home", date_of_birth: "1990-01-02" }, { profile_type: type, address_line1: "Entity office" });
      expect(result['subscriber_s_address_of_residence']).toBe("Entity office");
      expect(result['date_of_birth']).toBeUndefined();
    }
  });
  it("does not expose protected identifiers or infer confirmations", () => {
    const result = suppliedInvestorAnswers(null, { profile_type: "llc", details: { formation_state: "DE", tax_id: "123456789", bank_account: "123456", agreed: "Yes" } });
    expect(result).toEqual({ formation_state: "DE" });
  });
  it("late-arriving details never replace or restore a user-edited field", () => {
    expect(fillMissingInvestorAnswers({ city: "", phone: "555-0101" }, { city: "Denver", phone: "555-0102", country: "US" }, ["city", "phone", "country"], ["city"])).toEqual({ city: "", phone: "555-0101", country: "US" });
  });
});