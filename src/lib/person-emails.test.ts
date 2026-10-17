import { describe, expect, it } from "vitest";

import { cleanSecondaryEmail } from "./person-emails";

describe("cleanSecondaryEmail", () => {
  it("accepts a valid, different address and lowercases it", () => {
    expect(cleanSecondaryEmail("thomas.morgan@corpscappartners.com", "Morgato27@gmail.com ")).toEqual({
      ok: true,
      value: "morgato27@gmail.com",
    });
  });

  it("treats empty as clearing the secondary email", () => {
    expect(cleanSecondaryEmail("a@x.com", "")).toEqual({ ok: true, value: null });
    expect(cleanSecondaryEmail("a@x.com", null)).toEqual({ ok: true, value: null });
  });

  it("rejects malformed addresses", () => {
    expect(cleanSecondaryEmail("a@x.com", "not-an-email").ok).toBe(false);
    expect(cleanSecondaryEmail("a@x.com", "a@x").ok).toBe(false);
  });

  it("rejects the same address as the primary", () => {
    expect(cleanSecondaryEmail("a@X.com", "a@x.com")).toEqual({
      ok: false,
      error: "The secondary email must be different from the main email.",
    });
  });
});
