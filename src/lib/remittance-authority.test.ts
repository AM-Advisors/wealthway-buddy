import { describe, it, expect } from "vitest";
import { canEditRemittance } from "./sales-acceptance-model";
describe("Harmonious payment details authority", () => {
  it("CEO can edit", () => expect(canEditRemittance(["executive"])).toBe(true));
  it("CRO can edit", () => expect(canEditRemittance(["cro"])).toBe(true));
  it("Super Admin keeps logged-reason exception", () => expect(canEditRemittance(["super_admin"])).toBe(true));
  it("finance, legal, compliance, admin cannot", () => expect(canEditRemittance(["finance", "legal", "compliance", "admin", "operations"])).toBe(false));
});
