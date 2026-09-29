import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/irs-forms.server", () => ({ encryptTin: vi.fn(), decryptTin: vi.fn() }));
import { inferRpType, normalizeRpTin, stripRpTin } from "./responsible-party-identifier.server";

describe("responsible party identifier", () => {
  it("never keeps the identifier in SS-4 answers", () => {
    const out = stripRpTin({ legal_name: "Fund I", responsible_party_tin: "123456789", responsible_party_tin_last4: "6789" });
    expect(out).toEqual({ legal_name: "Fund I" });
  });
  it("validates and types identifiers", () => {
    expect(normalizeRpTin("123-45-6789")).toBe("123456789");
    expect(() => normalizeRpTin("123")).toThrow();
    expect(inferRpType("912345678")).toBe("itin");
    expect(inferRpType("123456789")).toBe("ssn");
  });
});
