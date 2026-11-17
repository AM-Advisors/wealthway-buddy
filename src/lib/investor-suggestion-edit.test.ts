import { describe, expect, it } from "vitest";
import { editableSuggestionText, normalizeEditedSuggestion } from "./investor-suggestion-edit";

describe("normalizeEditedSuggestion", () => {
  it("stores a corrected commitment in cents", () => {
    expect(normalizeEditedSuggestion("commitment_amount_cents", "$100,000")).toEqual({ ok: true, value: 10_000_000 });
  });
  it("refuses a malformed date", () => {
    expect(normalizeEditedSuggestion("investment_date", "5/8/2026").ok).toBe(false);
    expect(normalizeEditedSuggestion("investment_date", "2026-05-08")).toEqual({ ok: true, value: "2026-05-08" });
  });
  it("never saves a tax number into a text field", () => {
    expect(normalizeEditedSuggestion("address_line1", "123-45-6789").ok).toBe(false);
  });
  it("refuses an empty correction", () => {
    expect(normalizeEditedSuggestion("region", "  ").ok).toBe(false);
  });
  it("shows cents fields as dollars for editing", () => {
    expect(editableSuggestionText("commitment_amount_cents", 10_000_000)).toBe("100000");
  });
});
