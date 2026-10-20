import { describe, expect, it } from "vitest";
import { decideTinMatch, emailConnects } from "./account-connect-model";

describe("account connection rules", () => {
  it("connects a verified matching email", () => {
    expect(emailConnects("Calvin@Example.com", { email: "calvin@example.com", verified: true })).toBe(true);
  });
  it("never connects an unverified email", () => {
    expect(emailConnects("calvin@example.com", { email: "calvin@example.com", verified: false })).toBe(false);
  });
  it("never connects a different email", () => {
    expect(emailConnects("a@example.com", { email: "b@example.com", verified: true })).toBe(false);
  });
  it("tax ID match alone with a different account goes to review, not access", () => {
    const d = decideTinMatch({ matches: [{ profileId: "p1", ownerUserId: "other", ownerVerifiedEmail: "x@example.com" }], accountUserId: "me", accountVerifiedEmail: "me@example.com" });
    expect(d).toEqual({ kind: "review", profileIds: ["p1"] });
  });
  it("tax ID plus same verified email links the existing profile", () => {
    const d = decideTinMatch({ matches: [{ profileId: "p1", ownerUserId: null, ownerVerifiedEmail: "me@example.com" }], accountUserId: null, accountVerifiedEmail: "me@example.com" });
    expect(d).toEqual({ kind: "link_profile", profileId: "p1" });
  });
  it("same account's own profiles are simply recognized", () => {
    expect(decideTinMatch({ matches: [{ profileId: "p1", ownerUserId: "me", ownerVerifiedEmail: null }], accountUserId: "me", accountVerifiedEmail: null }).kind).toBe("same_account");
  });
});

import { normalizeLegalName } from "./account-connect-model";
describe("same tax ID + name + verified auto-connect", () => {
  const base = { accountUserId: null, accountVerifiedEmail: null, selfLegalName: "Calvin Jung", selfVerified: true };
  const other = { profileId: "p2", ownerUserId: "u2", ownerVerifiedEmail: "x@y.com", legalName: "calvin  jung", verified: true };
  it("merges when tax ID, name and verification all match", () => {
    expect(decideTinMatch({ ...base, matches: [other] })).toEqual({ kind: "merge", profileId: "p2" });
  });
  it("reviews when the name differs", () => {
    expect(decideTinMatch({ ...base, matches: [{ ...other, legalName: "Edward Belsey" }] }).kind).toBe("review");
  });
  it("reviews when either side is not verified", () => {
    expect(decideTinMatch({ ...base, matches: [{ ...other, verified: false }] }).kind).toBe("review");
    expect(decideTinMatch({ ...base, selfVerified: false, matches: [other] }).kind).toBe("review");
  });
  it("reviews when it would combine two different accounts", () => {
    expect(decideTinMatch({ ...base, accountUserId: "u1", matches: [other] }).kind).toBe("review");
  });
  it("ignores case, punctuation and suffix dots", () => {
    expect(normalizeLegalName("Acme Holdings, L.L.C.")).toBe(normalizeLegalName("ACME holdings LLC"));
    expect(normalizeLegalName("Thomas Morgan Jr.")).toBe(normalizeLegalName("thomas morgan jr"));
  });
});
