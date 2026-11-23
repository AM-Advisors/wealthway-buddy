import { describe, expect, it } from "vitest";
import { planInvitedInvestment, splitInvitedName } from "./invited-investment-model";

const base = { open: [], candidates: [], knownUserId: null, ownPersonId: null, hasOnboardingInvitation: true };

describe("planInvitedInvestment", () => {
  it("creates a new listed investor when nobody has this email", () => {
    expect(planInvitedInvestment(base)).toEqual({ kind: "create", personId: null, createPerson: true, investorUserId: null });
  });
  it("reuses the existing investment in the fund and attaches the invitation", () => {
    expect(planInvitedInvestment({ ...base, open: [{ id: "o1", invitationId: null }] })).toEqual({ kind: "existing", onboardingId: "o1", attachInvitation: true });
  });
  it("never replaces an invitation already on the investment", () => {
    expect(planInvitedInvestment({ ...base, open: [{ id: "o1", invitationId: "i0" }] })).toEqual({ kind: "existing", onboardingId: "o1", attachInvitation: false });
  });
  it("does not attach fund-access invitations as onboarding links", () => {
    expect(planInvitedInvestment({ ...base, hasOnboardingInvitation: false, open: [{ id: "o1", invitationId: null }] })).toMatchObject({ attachInvitation: false });
  });
  it("reuses the single unclaimed person with this email", () => {
    expect(planInvitedInvestment({ ...base, candidates: [{ id: "p1", userId: null }] })).toEqual({ kind: "create", personId: "p1", createPerson: false, investorUserId: null });
  });
  it("reuses the single signed-in person with this email and their login", () => {
    expect(planInvitedInvestment({ ...base, candidates: [{ id: "p1", userId: "u1" }] })).toEqual({ kind: "create", personId: "p1", createPerson: false, investorUserId: "u1" });
  });
  it("does not guess between several people sharing an email", () => {
    expect(planInvitedInvestment({ ...base, candidates: [{ id: "p1", userId: null }, { id: "p2", userId: null }] })).toEqual({ kind: "ambiguous" });
  });
  it("uses the invited login's own person, never another same-email person", () => {
    expect(planInvitedInvestment({ ...base, knownUserId: "u9", ownPersonId: null, candidates: [{ id: "p1", userId: null }] })).toEqual({ kind: "create", personId: null, createPerson: false, investorUserId: "u9" });
  });
});

describe("splitInvitedName", () => {
  it("splits first and last names", () => expect(splitInvitedName("Jane Q Doe")).toEqual({ firstName: "Jane", lastName: "Q Doe" }));
  it("keeps a single word as the first name", () => expect(splitInvitedName("Jane")).toEqual({ firstName: "Jane", lastName: null }));
  it("returns nothing for a blank name", () => expect(splitInvitedName("  ")).toEqual({ firstName: null, lastName: null }));
});
