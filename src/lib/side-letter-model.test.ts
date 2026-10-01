import { describe, expect, it } from "vitest";
import { canApprove, canPropose, expiryStatus, mfnCandidates } from "./side-letter-model";

const today = new Date("2026-10-01T12:00:00Z");

describe("expiryStatus", () => {
  it("is active without expiry", () => expect(expiryStatus({ effectiveDate: "2026-01-01", expiryDate: null }, today)).toBe("active"));
  it("is expiring within 60 days", () => expect(expiryStatus({ effectiveDate: null, expiryDate: "2026-11-15" }, today)).toBe("expiring"));
  it("is expired after date", () => expect(expiryStatus({ effectiveDate: null, expiryDate: "2026-09-30" }, today)).toBe("expired"));
  it("is not yet effective", () => expect(expiryStatus({ effectiveDate: "2027-01-01", expiryDate: null }, today)).toBe("not_effective"));
});

describe("mfnCandidates", () => {
  const base = { mfnEnabled: true, active: true };
  const holders = [
    { ...base, sideLetterId: "a", classKey: "A", commitmentCents: 100, mfnScope: "all_investors" as const },
    { ...base, sideLetterId: "b", classKey: "B", commitmentCents: 100, mfnScope: "same_class" as const },
    { ...base, sideLetterId: "c", classKey: "A", commitmentCents: 50, mfnScope: "commitment_at_or_below" as const },
    { ...base, sideLetterId: "d", classKey: "A", commitmentCents: 500, mfnScope: "commitment_at_or_below" as const },
    { ...base, sideLetterId: "e", classKey: "A", commitmentCents: 500, mfnScope: "all_investors" as const, active: false },
    { ...base, sideLetterId: "src", classKey: "A", commitmentCents: 200, mfnScope: "all_investors" as const },
  ];
  it("matches by scope and excludes source/inactive", () => {
    expect(mfnCandidates({ sideLetterId: "src", classKey: "A", commitmentCents: 200 }, holders)).toEqual(["a", "d"]);
  });
});

describe("approval eligibility", () => {
  it("blocks self-approval", () => expect(canApprove({ actorId: "u", actorKind: "staff", proposedBy: "u" })).toBe(false));
  it("lets another manager approve", () => expect(canApprove({ actorId: "m2", actorKind: "manager", proposedBy: "m1" })).toBe(true));
  it("lets a sole manager approve a staff proposal", () => expect(canApprove({ actorId: "m1", actorKind: "manager", proposedBy: "staff" })).toBe(true));
  it("never lets assistants approve", () => expect(canApprove({ actorId: "a", actorKind: "assistant", proposedBy: "m" })).toBe(false));
  it("assistants can propose, viewers cannot", () => {
    expect(canPropose("assistant")).toBe(true);
    expect(canPropose("viewer")).toBe(false);
  });
});
