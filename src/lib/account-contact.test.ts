import { describe, expect, it } from "vitest";
import { pickAccountContact } from "./account-contact.server";

describe("pickAccountContact", () => {
  it("uses the confirmed login email when there is no legacy profile", () => {
    expect(pickAccountContact({ loginEmail: "Apoorva+test12@harmonious.co", loginConfirmed: true }).email).toBe("apoorva+test12@harmonious.co");
  });
  it("keeps an existing profile email first", () => {
    expect(pickAccountContact({ profileEmail: "a@x.com", loginEmail: "b@x.com", loginConfirmed: true }).email).toBe("a@x.com");
  });
  it("ignores an unconfirmed login email and falls back to the linked person", () => {
    const c = pickAccountContact({ loginEmail: "b@x.com", loginConfirmed: false, personEmail: "p@x.com", personFirst: "Jane", personLast: "Doe" });
    expect(c.email).toBe("p@x.com");
    expect(c.legalName).toBe("Jane Doe");
  });
  it("returns no email when none is recorded anywhere", () => {
    expect(pickAccountContact({}).email).toBeNull();
  });
});
