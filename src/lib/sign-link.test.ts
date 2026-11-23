import { describe, expect, it } from "vitest";
import { signLinkPath, signLinkReadiness } from "./sign-link";

const ok = { removed: false, email: "a@b.co", requiresSignature: true, documentInFund: true, investorSigned: false, identityVerified: true };
describe("sign link", () => {
  it("goes to the investment's Sign step for that document", () => {
    expect(signLinkPath("ob1", "doc1")).toBe("/investment/ob1?step=sign&sign=doc1");
  });
  it("is ready only when only the signature is left", () => expect(signLinkReadiness(ok)).toEqual({ ready: true, reason: null }));
  it("waits for the identity check", () => expect(signLinkReadiness({ ...ok, identityVerified: false }).ready).toBe(false));
  it("needs an email", () => expect(signLinkReadiness({ ...ok, email: null }).ready).toBe(false));
  it("is not offered once signed", () => expect(signLinkReadiness({ ...ok, investorSigned: true }).ready).toBe(false));
  it("is not offered for removed investors", () => expect(signLinkReadiness({ ...ok, removed: true }).ready).toBe(false));
});
