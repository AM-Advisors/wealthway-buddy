import { describe, it, expect } from "vitest";
import { canCompleteVerificationOutside as can } from "./investor-upload-review.server";
const base = { isStaff: true, actorId: "a", investorUserId: "b", docKind: "identification", status: "new", personId: "p", provider: "Simplicii", checkedOn: "2026-01-02", note: "Passed" };
describe("outside KYC/AML", () => {
  it("staff can record with evidence", () => expect(can(base).ok).toBe(true));
  it("fund managers cannot", () => expect(can({ ...base, isStaff: false }).ok).toBe(false));
  it("no self-verification", () => expect(can({ ...base, investorUserId: "a" }).ok).toBe(false));
  it("only Government ID", () => expect(can({ ...base, docKind: "tax_form" }).ok).toBe(false));
  it("needs provider and note", () => { expect(can({ ...base, provider: " " }).ok).toBe(false); expect(can({ ...base, note: "" }).ok).toBe(false); });
  it("no future date", () => expect(can({ ...base, checkedOn: "2999-01-01" }).ok).toBe(false));
});
