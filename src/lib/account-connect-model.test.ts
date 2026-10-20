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
