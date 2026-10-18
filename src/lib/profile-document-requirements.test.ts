import { describe, expect, it } from "vitest";
import { profileDocumentRequirements, reusableProfileAccreditation } from "./profile-document-requirements";
import type { RequirementResult } from "./investor-onboarding-model";
const reqs: RequirementResult[] = [
  { key: "entity_verification", label: "Entity", state: "missing" },
  { key: "beneficial_owners", label: "Owners", state: "missing" },
  { key: "accreditation", label: "Accreditation", state: "not_applicable" },
];
describe("applicable profile documents", () => {
  it("does not require entity files for an individual", () => expect(profileDocumentRequirements("individual", reqs, [])).toEqual([]));
  it("requires LLC formation, agreement and owners", () => expect(profileDocumentRequirements("llc", reqs, []).map((r) => r.kind)).toEqual(["entity_formation", "operating_agreement", "ownership_list"]));
  it("requires a trust agreement, not corporate formation", () => expect(profileDocumentRequirements("trust", reqs, []).map((r) => r.kind)).toEqual(["operating_agreement", "ownership_list"]));
  it("reuses received evidence without declaring verification approved", () => {
    const rows = profileDocumentRequirements("llc", reqs, [{ kind: "entity_formation", status: "new" }]);
    expect(rows.find((r) => r.kind === "entity_formation")?.received).toBe(true);
    expect(reqs[0]?.state).toBe("missing");
  });
  it("requires an update for rejected evidence", () => expect(profileDocumentRequirements("llc", reqs, [{ kind: "entity_formation", status: "needs_followup" }])[0]?.received).toBe(false));
  it("requires updated evidence when verification has expired", () => {
    expect(profileDocumentRequirements("individual", [{ key: "accreditation", label: "Accreditation", state: "refresh_required" }], [{ kind: "accreditation_proof", status: "accepted" }])[0]?.received).toBe(false);
  });
  it("does not request documentary proof for self-certification", () => {
    const r: RequirementResult[] = [{ key: "accreditation", label: "Accreditation", state: "missing" }];
    expect(profileDocumentRequirements("individual", r, [], "self_certification")).toEqual([]);
    expect(profileDocumentRequirements("individual", r, [], "third_party")[0]?.kind).toBe("accreditation_proof");
  });
  it("keeps fund-specific accreditation ahead of reusable global evidence", () => {
    const global = { offering_id: null, status: "approved" };
    const scoped = { offering_id: "a", status: "review" };
    expect(reusableProfileAccreditation([global, scoped], "a")).toBe(scoped);
    expect(reusableProfileAccreditation([global, scoped], "b")).toBe(global);
  });
});