import { describe, it, expect } from "vitest";
import { scannerSafeRecoveryUrl } from "@/lib/scanner-safe-auth-link";

const verify = (token: string, redirect?: string, type = "recovery") =>
  `https://abc.supabase.co/auth/v1/verify?token=${token}&type=${type}${redirect ? `&redirect_to=${encodeURIComponent(redirect)}` : ""}`;

describe("password reset links survive email scanners", () => {
  it("links to our page with the code instead of the one-time sign-in link", () => {
    expect(scannerSafeRecoveryUrl(verify("abc123", "https://ops.harmonious.co/reset-password"), "https://app.harmonious.co"))
      .toBe("https://ops.harmonious.co/reset-password?token_hash=abc123&type=recovery");
  });
  it("never sends people to an outside address", () => {
    expect(scannerSafeRecoveryUrl(verify("abc123", "https://evil.example/reset"), "https://app.harmonious.co"))
      .toBe("https://app.harmonious.co/reset-password?token_hash=abc123&type=recovery");
  });
  it("strips the pkce prefix", () => {
    expect(scannerSafeRecoveryUrl(verify("pkce_xyz"), "https://app.harmonious.co")).toContain("token_hash=xyz&");
  });
  it("leaves other email types unchanged", () => {
    const u = verify("abc", undefined, "signup");
    expect(scannerSafeRecoveryUrl(u, "https://app.harmonious.co")).toBe(u);
  });
});
