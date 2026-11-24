import { describe, expect, it } from "vitest";
import { knownPersonFacts, newProfilePrefill, profileStepPrefill } from "./known-person-facts";

const person = { legal_first_name: "Alyssa", legal_last_name: "Pettit", date_of_birth: "1990-02-03", citizenship_country: "US", phone: "", address_line1: "" };
const ownProfile = { legal_name: "Alyssa Pettit", phone: "555-0100", address_line1: "1 Main St", city: "Austin", region: "TX", postal_code: "78701", country: "US" };

describe("known person facts", () => {
  it("fills a phone missing from the person record from the investor's own investing profile", () => {
    expect(knownPersonFacts(person, ownProfile, null).phone).toBe("555-0100");
  });
  it("prefers the person record over the login account", () => {
    expect(knownPersonFacts(person, null, { legal_name: "Someone Else", phone: "999" }).legal_first_name).toBe("Alyssa");
  });
  it("Complete your profile prefills only the fields still missing", () => {
    const facts = knownPersonFacts(person, ownProfile, null);
    expect(profileStepPrefill(["phone", "city"], facts)).toEqual({ phone: "555-0100", city: "Austin" });
  });
  it("a new individual profile starts with name, birthday, citizenship and address already in", () => {
    const pre = newProfilePrefill("individual", knownPersonFacts(person, ownProfile, null));
    expect(pre.name).toBe("Alyssa Pettit");
    expect(pre.kyc["date_of_birth"]).toBe("1990-02-03");
    expect(pre.kyc["citizenship"]).toBe("US");
    expect(pre.kyc["address_line1"]).toBe("1 Main St");
  });
  it("never prefills a tax ID number", () => {
    const pre = newProfilePrefill("individual", knownPersonFacts({ ...person, tax_id_last4: "1234" }, ownProfile, null));
    expect(pre.kyc["tax_id"]).toBeUndefined();
  });
  it("trusts and companies never reuse the person's own address", () => {
    expect(newProfilePrefill("trust", knownPersonFacts(person, ownProfile, null))).toEqual({ name: "", kyc: {} });
    expect(newProfilePrefill("llc", knownPersonFacts(person, ownProfile, null))).toEqual({ name: "", kyc: {} });
  });
});
