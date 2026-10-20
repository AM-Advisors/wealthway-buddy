import { describe, expect, it } from "vitest";
import { signingRefreshInterval } from "./signing-refresh";

describe("signing refresh", () => {
  it("refreshes pending provider confirmations", () => {
    for (const state of ["partially_signed", "out_for_signature"] as const) {
      expect(signingRefreshInterval({ error: null, provider: "box_sign", documents: [{ state }] })).toBe(30_000);
    }
  });
  it("stops for executed, terminal and unsent documents", () => {
    for (const state of ["executed", "declined", "expired", "cancelled", "error", "not_sent"] as const) {
      expect(signingRefreshInterval({ error: null, provider: "box_sign", documents: [{ state }] })).toBe(false);
    }
  });
  it("stops after errors and for internal signing", () => {
    expect(signingRefreshInterval({ error: new Error("Failed"), provider: "box_sign", documents: [{ state: "out_for_signature" }] })).toBe(false);
    expect(signingRefreshInterval({ error: null, provider: "internal", documents: [{ state: "out_for_signature" }] })).toBe(false);
  });
});