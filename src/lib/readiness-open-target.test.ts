import { describe, expect, it } from "vitest";
import { openTargetFor } from "./readiness-open-target";
describe("readiness open targets", () => {
  it("tax form never routes to copy approval", () => expect(openTargetFor("tax_documentation")).toEqual({ kind: "action", action: "send_tax_form" }));
  it("accreditation opens the investor's accreditation review, not fund approvals", () => expect(openTargetFor("accreditation")).toEqual({ kind: "review", section: "accreditation" }));
  it("wire matching goes to banking", () => expect(openTargetFor("funding")).toEqual({ kind: "fund", area: "banking" }));
  it("approve to fund stays on overview", () => expect(openTargetFor("approved_to_fund")).toEqual({ kind: "tab", tab: "overview" }));
  it("acceptance goes to operations onboarding", () => expect(openTargetFor("acceptance").kind).toBe("ops_onboarding"));
});
