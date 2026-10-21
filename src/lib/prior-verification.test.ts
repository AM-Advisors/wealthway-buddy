import { describe, expect, it } from "vitest";
import { amlFromResponse, iso2 } from "./prior-verification.server";

describe("prior verification reruns", () => {
  it("any screening hit goes to review, never approved", () => {
    expect(amlFromResponse({ aml: { status: "Approved", total_hits: 1 } })).toBe("review");
  });
  it("clean approved screening is approved", () => {
    expect(amlFromResponse({ aml: { status: "Approved", total_hits: 0 } })).toBe("approved");
  });
  it("country names map to two-letter codes for screening", () => {
    expect(iso2("United States")).toBe("US");
    expect(iso2("tw")).toBe("TW");
    expect(iso2("Narnia")).toBeNull();
  });
});
