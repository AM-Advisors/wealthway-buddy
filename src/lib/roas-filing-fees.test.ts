import { describe, expect, it } from "vitest";

import { ROAS_FILING_FEES, roasFilingFeeRange } from "./roas-filing-fees";

describe("ROAS conditional filing fees", () => {
  it("keeps the Harmonious preparation fee and state ranges separate", () => {
    expect(ROAS_FILING_FEES.harmoniousPreparationCents).toBe(16000);
    expect(ROAS_FILING_FEES.stateBaseLowCents).toBe(95000);
    expect(ROAS_FILING_FEES.stateBaseHighCents).toBe(185000);
    expect(ROAS_FILING_FEES.texasCapCents).toBe(50000);
  });

  it("calculates the conditional range without Texas", () => {
    expect(roasFilingFeeRange(0)).toEqual({ lowCents: 111000, highCents: 201000 });
  });

  it("calculates the conditional range at the Texas cap", () => {
    expect(roasFilingFeeRange()).toEqual({ lowCents: 161000, highCents: 251000 });
  });

  it("refuses amounts above the Texas cap", () => {
    expect(() => roasFilingFeeRange(50001)).toThrow("Texas notice fees");
  });
});
