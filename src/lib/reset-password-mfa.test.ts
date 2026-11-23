import { describe, expect, it } from "vitest";
import { cleanAuthenticatorCode, isSecondStepRequiredError, resetSecondStep } from "./reset-password-mfa";

describe("resetSecondStep", () => {
  it("asks for the code when an enrolled account arrives from a reset link", () => {
    expect(resetSecondStep({ currentLevel: "aal1", verifiedFactorCount: 1 })).toBe("needed");
  });
  it("skips the code for accounts without an authenticator", () => {
    expect(resetSecondStep({ currentLevel: "aal1", verifiedFactorCount: 0 })).toBe("not_needed");
  });
  it("skips the code once the second step is already done", () => {
    expect(resetSecondStep({ currentLevel: "aal2", verifiedFactorCount: 1 })).toBe("not_needed");
  });
  it("reports unknown when factors can't be read", () => {
    expect(resetSecondStep({ currentLevel: "aal1", verifiedFactorCount: null })).toBe("unknown");
  });
});

describe("isSecondStepRequiredError", () => {
  it("recognizes the sign-in service's AAL2 refusal", () => {
    expect(isSecondStepRequiredError({ message: "AAL2 required to update password" })).toBe(true);
    expect(isSecondStepRequiredError({ code: "insufficient_aal", message: "x" })).toBe(true);
  });
  it("ignores unrelated errors", () => {
    expect(isSecondStepRequiredError({ message: "Password should be at least 8 characters" })).toBe(false);
    expect(isSecondStepRequiredError(null)).toBe(false);
  });
});

describe("cleanAuthenticatorCode", () => {
  it("accepts six digits with pasted spaces", () => {
    expect(cleanAuthenticatorCode("123 456")).toBe("123456");
  });
  it("rejects anything else", () => {
    expect(cleanAuthenticatorCode("12345")).toBeNull();
    expect(cleanAuthenticatorCode("12a456")).toBeNull();
  });
});
