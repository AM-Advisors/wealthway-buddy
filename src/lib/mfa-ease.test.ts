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

describe("texted codes", () => {
  it("reads a stored phone value as the number Twilio needs", () => {
    expect(normalizeSmsPhone("303-555-0142")).toBe("+13035550142");
    expect(normalizeSmsPhone("+1 (303) 555-0142")).toBe("+13035550142");
    expect(normalizeSmsPhone("13035550142")).toBe("+13035550142");
    expect(normalizeSmsPhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("refuses to guess a country for an ambiguous number", () => {
    expect(normalizeSmsPhone("555-0100")).toBeNull();
    expect(normalizeSmsPhone("23456789")).toBeNull();
    expect(normalizeSmsPhone("")).toBeNull();
    expect(normalizeSmsPhone(null)).toBeNull();
  });

  it("shows only the country code and last four digits", () => {
    expect(maskPhone("+13035550142")).toBe("+1 •••0142");
    expect(maskPhone("+442079460958")).toBe("+44 •••0958");
  });

  it("keeps a texted code from satisfying an emailed-code request", () => {
    expect(smsPurpose("tax_document")).toBe("tax_document:sms");
    expect(smsPurpose("tax_document")).not.toBe("tax_document");
  });

  it("only offers texting when a sender number or messaging service is configured", () => {
    expect(pickSmsSender({ TWILIO_FROM_NUMBER: "+15550100123" })).toEqual({ from: "+15550100123" });
    expect(pickSmsSender({ TWILIO_MESSAGING_SERVICE_SID: `MG${"0".repeat(32)}` })).toEqual({
      messagingServiceSid: `MG${"0".repeat(32)}`,
    });
    expect(pickSmsSender({})).toBeNull();
    expect(pickSmsSender({ TWILIO_FROM_NUMBER: "" })).toBeNull();
  });

  it("falls back to a texted code only when nothing else passed", () => {
    expect(
      pickStepUpMethod({ freshSecondFactor: false, trustedDeviceOk: false, emailCodeOk: false, smsCodeOk: true }),
    ).toEqual({ method: "otp_sms", proofUsed: "sms_code" });
    expect(
      pickStepUpMethod({ freshSecondFactor: false, trustedDeviceOk: false, emailCodeOk: true, smsCodeOk: true }).method,
    ).toBe("otp_email");
  });
});
