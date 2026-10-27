import { describe, expect, it } from "vitest";
import { effectiveWixFundId, latestAssociations, resolveFundMatch, type WixAssociation } from "./wix-association-model";

const a = (p: Partial<WixAssociation>): WixAssociation => ({ kind: "investment", wix_id: "i1", offering_id: null, wix_fund_id: null, created_at: "2026-10-01", ...p });

describe("wix associations", () => {
  it("latest association wins", () => {
    const m = latestAssociations([a({ wix_fund_id: "f1", created_at: "2026-10-01" }), a({ wix_fund_id: "f2", created_at: "2026-10-02" })], "investment");
    expect(m.get("i1")?.wix_fund_id).toBe("f2");
  });
  it("staff assignment overrides imported fund, and can clear it", () => {
    expect(effectiveWixFundId("f1", a({ wix_fund_id: "f9" }))).toBe("f9");
    expect(effectiveWixFundId("f1", a({ wix_fund_id: null }))).toBeNull();
    expect(effectiveWixFundId("f1", undefined)).toBe("f1");
  });
  it("name match is only a suggestion; confirmed choice wins", () => {
    const sug = { id: "o1", name: "Alpha" };
    expect(resolveFundMatch(sug, undefined, () => undefined).match?.source).toBe("suggested");
    expect(resolveFundMatch(sug, a({ kind: "fund", offering_id: "o2" }), () => "Beta").match).toEqual({ id: "o2", name: "Beta", source: "confirmed" });
    expect(resolveFundMatch(sug, a({ kind: "fund", offering_id: null }), () => undefined)).toEqual({ match: null, confirmedNone: true });
  });
});
