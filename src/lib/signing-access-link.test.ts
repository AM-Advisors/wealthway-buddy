import { describe, expect, it } from "vitest";
import { isTokenShape, linkExpiry, linkState } from "./signing-access-link";

const now = new Date("2026-11-23T20:00:00Z");
describe("signing access links", () => {
  it("lasts 14 days", () => expect(linkExpiry(now)).toBe("2026-12-07T20:00:00.000Z"));
  it("is active before it expires", () => expect(linkState({ expires_at: "2026-12-07T20:00:00Z", revoked_at: null, used_at: null }, now)).toBe("active"));
  it("stops working after 14 days", () => expect(linkState({ expires_at: "2026-11-23T19:59:59Z", revoked_at: null, used_at: null }, now)).toBe("expired"));
  it("stops working once cancelled or replaced", () => expect(linkState({ expires_at: "2026-12-07T20:00:00Z", revoked_at: "2026-11-23T19:00:00Z", used_at: null }, now)).toBe("revoked"));
  it("stops working once signed", () => expect(linkState({ expires_at: "2026-12-07T20:00:00Z", revoked_at: null, used_at: "2026-11-23T19:00:00Z" }, now)).toBe("used"));
  it("accepts only full-length tokens", () => {
    expect(isTokenShape("a".repeat(43))).toBe(true);
    expect(isTokenShape("abc")).toBe(false);
  });
});
