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

describe("signing link waits for the shared signing gate", () => {
  const ok = { removed: false, email: "a@b.co", requiresSignature: true, documentInFund: true, investorSigned: false, identityVerified: true };
  it("refuses while business documents or owners are missing", async () => {
    const { signLinkReadiness } = await import("./sign-link");
    const r = signLinkReadiness({ ...ok, signingBlockers: ["Owners and signers: We still need: trustee"] });
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("Owners and signers");
  });
  it("is ready when nothing blocks signing", async () => {
    const { signLinkReadiness } = await import("./sign-link");
    expect(signLinkReadiness({ ...ok, signingBlockers: [] }).ready).toBe(true);
  });
});

describe("signingBlockerReasons", () => {
  it("lists only unfinished signing requirements", async () => {
    const { signingBlockerReasons } = await import("./investor-onboarding-model");
    const out = signingBlockerReasons([
      { key: "identity_verification", label: "Identity", state: "valid" },
      { key: "aml", label: "Screening", state: "review_required", signingAllowed: true },
      { key: "beneficial_owners", label: "Owners and signers", state: "missing" as any, reason: "We still need: trustee" },
    ] as any);
    expect(out).toEqual(["Owners and signers: We still need: trustee"]);
  });
});
