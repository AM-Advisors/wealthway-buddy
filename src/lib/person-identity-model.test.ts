import { describe, expect, it } from "vitest";
import { personIdentityAction } from "@/lib/person-identity-model";

describe("one identity check per person", () => {
  it("a passed login check is reused, never a new session", () => {
    expect(personIdentityAction({ status: "approved", sessionUrl: "https://x" }).kind).toBe("reuse");
  });
  it("a login check under review means wait, with no new link", () => {
    expect(personIdentityAction({ status: "review", sessionUrl: "https://x" })).toEqual({ kind: "wait" });
  });
  it("an unfinished login check reopens the same link", () => {
    expect(personIdentityAction({ status: "pending", sessionUrl: "https://same" })).toEqual({ kind: "resume", url: "https://same" });
  });
  it("a sent-back check gets one recovery start", () => {
    expect(personIdentityAction({ status: "sent_back", sessionUrl: null }).kind).toBe("start");
  });
  it("a declined check is not restarted by the investor", () => {
    expect(personIdentityAction({ status: "declined", sessionUrl: null }).kind).toBe("blocked");
  });
});

import { prefillFactsFrom } from "@/lib/person-identity-model";

describe("questionnaire prefill facts from identity checks", () => {
  const held = { status: "review", provider_decision: "Approved", completed_at: null, verified_full_name: "Jordan Q Example", document_issuing_country: "USA" };
  it("an approved person reuses the provider-approved check held for Harmonious review", () => {
    expect(prefillFactsFrom("approved", [held])).toEqual({ fullName: "Jordan Q Example", documentCountry: "USA" });
  });
  it("a person not yet approved gets nothing from a held check", () => {
    expect(prefillFactsFrom("review", [held])).toBeNull();
    expect(prefillFactsFrom(null, [held])).toBeNull();
  });
  it("declined or provider-unapproved checks never supply facts", () => {
    expect(prefillFactsFrom("approved", [{ ...held, status: "declined" }])).toBeNull();
    expect(prefillFactsFrom("approved", [{ ...held, provider_decision: "In Review" }])).toBeNull();
  });
  it("a completed approved check wins regardless of person status", () => {
    const done = { ...held, status: "approved", completed_at: "2026-10-27", verified_full_name: "Done Name" };
    expect(prefillFactsFrom("pending", [held, done])?.fullName).toBe("Done Name");
  });
});
