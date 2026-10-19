import { describe, expect, it } from "vitest";
import { personalLinkPermissions } from "./personal-investment-link-model";

describe("personal investment link permissions", () => {
  it("lets a manager create a link only when none exists and an email is on file", () => {
    expect(personalLinkPermissions({ isInvestor: false, hasLink: false, linkActive: false, hasEmail: true }).canCreate).toBe(true);
    expect(personalLinkPermissions({ isInvestor: false, hasLink: true, linkActive: true, hasEmail: true }).canCreate).toBe(false);
    expect(personalLinkPermissions({ isInvestor: false, hasLink: false, linkActive: false, hasEmail: false }).canCreate).toBe(false);
  });
  it("never lets an investor create or send links", () => {
    const p = personalLinkPermissions({ isInvestor: true, hasLink: true, linkActive: true, hasEmail: true });
    expect(p.canCreate).toBe(false); expect(p.canSend).toBe(false);
  });
  it("does not let managers replace a link", () => {
    expect(personalLinkPermissions({ isInvestor: false, hasLink: true, linkActive: false, hasEmail: true }).canReplace).toBe(false);
  });
});
