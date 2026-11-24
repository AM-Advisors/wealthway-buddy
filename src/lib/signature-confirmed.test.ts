import { describe, expect, it } from "vitest";
import { confirmedSignedAt, signatureConfirmed } from "./signature-confirmed";

describe("signature confirmed", () => {
  it("a paper only sent for signature is not signed (Todd Floyd's Subscription Agreement)", () =>
    expect(signatureConfirmed({ provider: "box_sign", provider_status: "out_for_signature", provider_completed_at: null, signed_at: "2026-11-19T05:34:10Z" })).toBe(false));
  it("a paper the signing service completed is signed", () =>
    expect(signatureConfirmed({ provider: "box_sign", provider_status: "completed", provider_completed_at: "2026-11-19T05:55:30Z", signed_at: "2026-11-19T05:55:30Z" })).toBe(true));
  it("a paper signed on the platform is signed", () =>
    expect(signatureConfirmed({ provider: "internal", provider_status: null, signed_at: "2026-11-19T05:00:00Z" })).toBe(true));
  it("a cancelled paper is not signed", () =>
    expect(signatureConfirmed({ provider: "box_sign", provider_status: "completed", provider_completed_at: "2026-11-19T05:55:30Z", cancelled_at: "2026-11-20T00:00:00Z" })).toBe(false));
  it("no signed time for a sent paper", () =>
    expect(confirmedSignedAt({ provider: "box_sign", provider_status: "out_for_signature", signed_at: "2026-11-19T05:34:10Z" })).toBeNull());
});
