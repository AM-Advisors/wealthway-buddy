import { describe, expect, it } from "vitest";
import { portalAllowed, type PortalAccessFacts } from "./portal-access-model";

const none: PortalAccessFacts = { roles: [], fundAccessRows: 0, applications: 0, clientMemberships: 0, fundTeamEntries: 0, sharedFundGrants: 0 };

describe("portal hold screen", () => {
  it("someone with no relationship at all stays on the hold screen", () => {
    expect(portalAllowed(none)).toBe(false);
  });
  it("a person listed on a fund's Team page gets in", () => {
    expect(portalAllowed({ ...none, fundTeamEntries: 1 })).toBe(true);
  });
  it("a view-only company member gets in", () => {
    expect(portalAllowed({ ...none, clientMemberships: 1 })).toBe(true);
  });
  it("a person given fund team access gets in", () => {
    expect(portalAllowed({ ...none, sharedFundGrants: 1 })).toBe(true);
  });
});
