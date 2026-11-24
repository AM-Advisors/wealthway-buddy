import { describe, expect, it } from "vitest";
import { partyAccess, partyNextAction } from "./investment-parties";
describe("investment parties", () => {
  it("a co-owner with only a view invite never gets investor access", () => {
    expect(partyAccess({ isInvestorLogin: false, participantRoles: ["contact"] })).toBe("view_only");
  });
  it("the investor login is full access", () => {
    expect(partyAccess({ isInvestorLogin: true, participantRoles: [] })).toBe("investor");
  });
  it("suggests an invite for an owner with an email and no access", () => {
    expect(partyNextAction({ email: "a@b.co", hasLogin: false, access: "none", kycApproved: true, unsignedCount: 1 })).toBe("invite");
  });
  it("suggests signing once verified and invited", () => {
    expect(partyNextAction({ email: "a@b.co", hasLogin: false, access: "view_only", kycApproved: true, unsignedCount: 2 })).toBe("sign");
  });
});
