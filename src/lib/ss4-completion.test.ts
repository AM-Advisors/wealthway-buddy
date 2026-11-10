import { describe, expect, it } from "vitest";
import { mergeSignerForm, ss4MissingLines } from "./ss4-completion";

const full = { legal_name: "Acme I LLC", mailing_street: "1 Main St", mailing_city_state_zip: "Austin, TX 78701", county_state: "Travis, TX", responsible_party_name: "Thomas Morgan", entity_kind: "partnership", reason: "started_business", date_started: "01/02/2026", closing_month: "December" };

describe("SS-4 completion before signing", () => {
  it("a complete form has nothing missing", () => expect(ss4MissingLines(full)).toEqual([]));
  it("names each missing line the manager must complete", () => {
    expect(ss4MissingLines({ ...full, county_state: "", responsible_party_name: " " })).toEqual(["Line 6: county and state", "Line 7a: responsible party name"]);
  });
  it("the manager's edits fill missing lines", () => {
    const merged = mergeSignerForm({ ...full, county_state: "" }, { county_state: " Travis, TX " });
    expect(merged["county_state"]).toBe("Travis, TX");
    expect(ss4MissingLines(merged)).toEqual([]);
  });
  it("edits can't change tax IDs or the Harmonious designee", () => {
    const merged = mergeSignerForm({ ...full, designee_name: "Harmonious LLC" }, { designee_name: "Someone else", responsible_party_tin: "123456789" });
    expect(merged["designee_name"]).toBe("Harmonious LLC");
    expect(merged).not.toHaveProperty("responsible_party_tin");
  });
});
