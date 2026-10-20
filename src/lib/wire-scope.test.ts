import { describe, expect, it } from "vitest";
import { instructionsForInvestor } from "./wire-scope";

const d = { bank_name: "Choice", routing_number: "091311229", swift: "CHFGUS44021", intl_bank_name: "Choice" };

describe("wire instructions by scope and investor location", () => {
  it("USA only: every investor sees domestic only", () => {
    const r = instructionsForInvestor({ ...d, wire_scope: "domestic" }, "Germany");
    expect(r.domestic).not.toBeNull();
    expect(r.international).toBeNull();
  });
  it("International only: every investor sees international only", () => {
    const r = instructionsForInvestor({ ...d, wire_scope: "international" }, "United States");
    expect(r.domestic).toBeNull();
    expect(r.international).not.toBeNull();
  });
  it("Both: US investor sees domestic only", () => {
    const r = instructionsForInvestor({ ...d, wire_scope: "both" }, "US");
    expect(r.domestic).not.toBeNull();
    expect(r.international).toBeNull();
  });
  it("Both: non-US investor sees international only", () => {
    const r = instructionsForInvestor({ ...d, wire_scope: "both" }, "Canada");
    expect(r.domestic).toBeNull();
    expect(r.international).not.toBeNull();
  });
});


describe("older records without a saved scope", () => {
  it("shows the account and routing numbers to overseas investors", () => {
    const r = instructionsForInvestor({ bank_name: "B", account_number: "123", routing_number: "021", swift: "ABCDUS33" }, "Germany");
    expect(r.domestic?.["Account number"]).toBe("123");
    expect(r.international?.["SWIFT / BIC"]).toBe("ABCDUS33");
  });
});
