import { describe, expect, it } from "vitest";
import { normalizePromotionalEmail, promotionalEmailAllowed } from "./promotional-email-model";
describe("shared promotional email restrictions", () => {
  it("normalizes one email-wide preference", () => expect(normalizePromotionalEmail(" Person@Example.test ")).toBe("person@example.test"));
  it("never sends after an unsubscribe in another area", () => expect(promotionalEmailAllowed({ consent: "opted_in", suppressed: true, archived: false, bulk: false })).toBe(false));
  it("requires positive consent for campaigns", () => expect(promotionalEmailAllowed({ consent: "unknown", suppressed: false, archived: false, bulk: true })).toBe(false));
  it("does not treat a customer relationship as campaign consent", () => expect(promotionalEmailAllowed({ consent: "unknown", suppressed: false, archived: false, bulk: true })).toBe(false));
  it("allows opted-in campaign recipients", () => expect(promotionalEmailAllowed({ consent: "opted_in", suppressed: false, archived: false, bulk: true })).toBe(true));
  it("retains one-to-one outreach rules without overriding opt-outs", () => expect(promotionalEmailAllowed({ consent: "unknown", suppressed: false, archived: false, bulk: false })).toBe(true));
  it("excludes archived contacts", () => expect(promotionalEmailAllowed({ consent: "opted_in", suppressed: false, archived: true, bulk: true })).toBe(false));
});