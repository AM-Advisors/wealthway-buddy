import { describe, it, expect } from "vitest";
import { msaRequirement, proposalVisibleSections, selectedServiceLabels } from "./sales-documents-model";

describe("MSA signed once", () => {
  it("first-time client signs the current MSA", () => expect(msaRequirement([], "v2")).toBe("v2"));
  it("client who already signed is not asked again", () => expect(msaRequirement([{ msa_version_id: "v1", executed_at: "2026-01-01", created_at: "2026-01-01" }], "v2")).toBeNull());
  it("client assigned a new version signs that version", () => expect(msaRequirement([{ msa_version_id: "v1", executed_at: "2026-01-01", created_at: "2026-01-01" }, { msa_version_id: "v2", executed_at: null, created_at: "2026-05-01" }], "v2")).toBe("v2"));
});
describe("proposal content", () => {
  it("hides the MSA terms before signing", () => expect(proposalVisibleSections([{ key: "summary" }, { key: "terms" }]).map((s) => s.key)).toEqual(["summary"]));
  it("lists only selected services", () => expect(selectedServiceLabels([{ label: "NAV" }, { label: "NAV" }, { label: "Tax" }])).toEqual(["NAV", "Tax"]));
});
