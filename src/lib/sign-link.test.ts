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

describe("signing service email", () => {
  it("resends when the signing service already emailed an open copy", async () => {
    const { providerEmailAction } = await import("./sign-link");
    expect(providerEmailAction({ delivery: "provider_email", providerStatus: "out_for_signature", agreementId: "r1" })).toBe("resend");
  });
  it("sends a fresh copy when the open request is an in-app one", async () => {
    const { providerEmailAction } = await import("./sign-link");
    expect(providerEmailAction({ delivery: null, providerStatus: "out_for_signature", agreementId: "r1" })).toBe("send");
  });
  it("sends a fresh copy when the emailed request is no longer open", async () => {
    const { providerEmailAction } = await import("./sign-link");
    expect(providerEmailAction({ delivery: "provider_email", providerStatus: "cancelled", agreementId: "r1" })).toBe("send");
  });
});

describe("an open request is never replaced after the signer signed", () => {
  it("treats a signer's recorded signature as signed even before our records catch up", async () => {
    const { liveSignatureRecorded } = await import("./document-signing");
    expect(liveSignatureRecorded({ status: "viewed", signers: [{ email: "chris@x.co", decision: "signed" }, { email: "gp@x.co", decision: null }] }, "Chris@x.co")).toBe(true);
  });
  it("treats a completed request as signed", async () => {
    const { liveSignatureRecorded } = await import("./document-signing");
    expect(liveSignatureRecorded({ status: "signed", signers: [] }, "chris@x.co")).toBe(true);
  });
  it("allows replacing an unsigned open request", async () => {
    const { liveSignatureRecorded } = await import("./document-signing");
    expect(liveSignatureRecorded({ status: "sent", signers: [{ email: "chris@x.co", decision: null }] }, "chris@x.co")).toBe(false);
  });
});
