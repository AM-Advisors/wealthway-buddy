import { describe, expect, it } from "vitest";
import { groupStalled, isStalled, type StallRow } from "./stalled-investors-model";
const now = new Date("2026-11-25T00:00:00Z");
const row = (o: Partial<StallRow>): StallRow => ({ id: "1", offering_id: "f", stage: "profile_selected",
  last_activity_at: "2026-11-10T00:00:00Z", removed_at: null, merged_into_onboarding_id: null, is_test_investor: false, ...o });
describe("stalled investors", () => {
  it("7+ days without activity is stalled", () => expect(isStalled(row({}), now)).toBe(true));
  it("6 days is not stalled", () => expect(isStalled(row({ last_activity_at: "2026-11-19T00:00:00Z" }), now)).toBe(false));
  it("funded, test and merged investments are never counted", () => {
    expect(groupStalled([row({ stage: "funded" }), row({ is_test_investor: true }), row({ merged_into_onboarding_id: "x" })], now)).toEqual([]);
  });
});
import { whatsLeftBeforeSigning } from "./stalled-investors-model";
describe("what's left before signing", () => {
  it("lists open pre-signing items and skips signing, funding and finished items", () => {
    const left = whatsLeftBeforeSigning([
      { key: "tax_documentation", label: "Tax ID", state: "missing" },
      { key: "aml", label: "Compliance screening", state: "valid" },
      { key: "accreditation", label: "Accreditation", state: "not_applicable" },
      { key: "signature", label: "Signature", state: "missing" },
      { key: "funding", label: "Funding", state: "missing" },
    ] as any);
    expect(left).toEqual(["Tax ID: not started"]);
  });
});
