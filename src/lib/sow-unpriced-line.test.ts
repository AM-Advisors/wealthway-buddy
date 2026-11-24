import { describe, it, expect } from "vitest";
import { isUnpricedSowLine } from "./sow-unpriced-line";
describe("isUnpricedSowLine", () => {
  it("treats a $0 line with no reason as unpriced", () => expect(isUnpricedSowLine({ standard_cents: 0, final_cents: 0 })).toBe(true));
  it("keeps an explicitly included $0 line with a reason", () => expect(isUnpricedSowLine({ standard_cents: 0, final_cents: 0, adjustment_reason: "Included with SPV" })).toBe(false));
  it("keeps at-cost lines", () => expect(isUnpricedSowLine({ final_cents: 0, pass_through: true })).toBe(false));
  it("keeps priced lines", () => expect(isUnpricedSowLine({ standard_cents: 250000, final_cents: 0 })).toBe(false));
});
