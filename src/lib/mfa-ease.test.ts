import { describe, expect, it } from "vitest";

import {
  countRecentFallbackSends,
  isTrustedRowValid,
  maskEmail,
  maskPhone,
  normalizeSmsPhone,
  pickSmsSender,
  pickStepUpMethod,
  smsPurpose,
  trustedDeviceExpiry,
} from "./mfa-ease";

describe("trusted device validity", () => {
  it("is valid until expiry and only if not revoked", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    const row = { expires_at: "2026-11-16T12:00:00Z", revoked_at: null };
    expect(isTrustedRowValid(row, now)).toBe(true);
    expect(isTrustedRowValid({ ...row, revoked_at: "2026-10-16T00:00:00Z" }, now)).toBe(false);
    expect(isTrustedRowValid({ ...row, expires_at: "2026-10-17T11:59:59Z" }, now)).toBe(false);
    expect(isTrustedRowValid(null, now)).toBe(false);
  });

  it("expires exactly 30 days after creation", () => {
    const created = new Date("2026-10-17T12:00:00Z");
    expect(trustedDeviceExpiry(created)).toBe("2026-11-16T12:00:00.000Z");
  });
});

describe("pickStepUpMethod", () => {
  it("prefers a fresh authenticator check, then a remembered device, then an emailed code", () => {
    expect(pickStepUpMethod({ freshSecondFactor: true, trustedDeviceOk: true, emailCodeOk: true })).toEqual({
      method: "mfa_reverify",
      proofUsed: "fresh",
    });
    expect(pickStepUpMethod({ freshSecondFactor: false, trustedDeviceOk: true, emailCodeOk: true })).toEqual({
      method: "trusted_device",
      proofUsed: "trusted_device",
    });
    expect(pickStepUpMethod({ freshSecondFactor: false, trustedDeviceOk: false, emailCodeOk: true })).toEqual({
      method: "otp_email",
      proofUsed: "email_code",
    });
  });

  it("never invents a proof when none is valid", () => {
    expect(pickStepUpMethod({ freshSecondFactor: false, trustedDeviceOk: false, emailCodeOk: false }).proofUsed).toBeNull();
  });
});

describe("email fallback limits", () => {
  it("counts only codes sent in the last hour", () => {
    const now = new Date("2026-10-17T12:00:00Z").getTime();
    const sends = [
      "2026-10-17T11:30:00Z", // inside the hour
      "2026-10-17T11:00:01Z", // inside the hour
      "2026-10-17T10:59:00Z", // just outside
      "2026-10-16T12:00:00Z", // yesterday
    ];
    expect(countRecentFallbackSends(sends, now)).toBe(2);
  });

  it("masks the recipient address", () => {
    expect(maskEmail("alyssa@harmonious.co")).toBe("al***sa@harmonious.co");
    expect(maskEmail("a@harmonious.co")).toBe("a***a@harmonious.co");
  });
});
