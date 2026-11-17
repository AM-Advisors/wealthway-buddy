import { describe, expect, it } from "vitest";
import { openLabelFor, openTargetFor } from "./readiness-open-target";
describe("readiness open targets", () => {
  it("subscription documents open their copies instead of a preparation action", () => expect(openTargetFor("subscription_documents")).toEqual({ kind: "tab", tab: "documents" }));
  it("tax form never routes to copy approval", () => expect(openTargetFor("tax_documentation")).toEqual({ kind: "action", action: "send_tax_form" }));
  it("accreditation opens the investor's accreditation review, not fund approvals", () => expect(openTargetFor("accreditation")).toEqual({ kind: "review", section: "accreditation" }));
  it("wire matching goes to banking", () => expect(openTargetFor("funding")).toEqual({ kind: "fund", area: "banking" }));
  it("approve to fund stays on overview", () => expect(openTargetFor("approved_to_fund")).toEqual({ kind: "tab", tab: "overview" }));
  it("acceptance goes to operations onboarding", () => expect(openTargetFor("acceptance").kind).toBe("ops_onboarding"));
  it("signed tax form on file: classification opens the copy, never re-sends", () => {
    expect(openTargetFor("tax_classification", "harmonious")).toEqual({ kind: "tab", tab: "documents" });
    expect(openTargetFor("tax_classification", "investor")).toEqual({ kind: "action", action: "send_tax_form" });
  });
  it("uploaded tax form under review: Harmonious confirms it in Documents, never re-sends", () => {
    expect(openTargetFor("tax_documentation", "harmonious")).toEqual({ kind: "tab", tab: "documents" });
    expect(openLabelFor("tax_documentation", "harmonious")).toBe("Confirm tax form");
    expect(openLabelFor("tax_documentation", "investor")).toBe("Send tax form to sign");
  });
});
