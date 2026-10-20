import { describe, expect, it } from "vitest";
import { canLinkPreparedInvestment } from "./investor-onboarding-model";

const calvin = { userId: "u1", email: "calvinjungmd@gmail.com" };
describe("connecting a manager-added investment on sign-in", () => {
  it("connects the invited person's unclaimed record", () => {
    expect(canLinkPreparedInvestment({ personUserId: null, personEmail: "CalvinJungMD@gmail.com" }, calvin)).toBe(true);
  });
  it("reconnects when the record is already this account", () => {
    expect(canLinkPreparedInvestment({ personUserId: "u1", personEmail: "calvinjungmd@gmail.com" }, calvin)).toBe(true);
  });
  it("refuses a record owned by a different account", () => {
    expect(canLinkPreparedInvestment({ personUserId: "u2", personEmail: "calvinjungmd@gmail.com" }, calvin)).toBe(false);
  });
  it("refuses when the record's email is someone else's", () => {
    expect(canLinkPreparedInvestment({ personUserId: null, personEmail: "other@example.com" }, calvin)).toBe(false);
  });
});
