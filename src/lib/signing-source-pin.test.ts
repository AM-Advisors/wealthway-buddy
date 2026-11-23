import { describe, expect, it } from "vitest";
import { openRequestReusable, signingSourcePinned } from "./signing-source-pin";

const open = { provider_sent_at: "2026-11-23T19:00:00Z", provider_status: "out_for_signature", cancelled_at: null, provider_completed_at: null };

describe("signing source pin", () => {
  it("replacing an open unsigned request prepares and fills the current version", () => {
    expect(signingSourcePinned(open, { newRequest: true })).toBe(false);
  });
  it("reading an open request keeps the version it was sent with", () => {
    expect(signingSourcePinned(open)).toBe(true);
  });
  it("a signed request always stays on its original version", () => {
    expect(signingSourcePinned({ ...open, provider_completed_at: "2026-11-23T19:30:00Z" }, { newRequest: true })).toBe(true);
  });
});

describe("open request reuse", () => {
  it("subscription agreements sent before the fix are rebuilt once", () => {
    expect(openRequestReusable({ sentAt: "2026-11-23T19:17:46Z", documentCategory: "subscription_agreement" })).toBe(false);
  });
  it("subscription agreements sent after the fix are reused", () => {
    expect(openRequestReusable({ sentAt: "2026-11-23T21:00:00Z", documentCategory: "subscription_agreement" })).toBe(true);
  });
  it("other guided documents sent after Nov 18 are still reused", () => {
    expect(openRequestReusable({ sentAt: "2026-11-19T05:00:00Z", documentCategory: "operating_agreement" })).toBe(true);
  });
  it("requests sent before guided signing are replaced", () => {
    expect(openRequestReusable({ sentAt: "2026-11-06T17:31:56Z", documentCategory: "operating_agreement" })).toBe(false);
  });
});
