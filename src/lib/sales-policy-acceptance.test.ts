import { describe, expect, it } from "vitest";
import { policyNeeds, policiesToRecord, shortCode } from "./sales-acceptance-model";

const docs = [
  { id: "p1", kind: "privacy", version: 1, title: "P", body: "" },
  { id: "p2", kind: "privacy", version: 2, title: "P", body: "" },
  { id: "t2", kind: "terms", version: 2, title: "T", body: "" },
];

describe("quote policy acceptance", () => {
  it("asks for the latest Privacy Policy and Terms & Conditions", () => {
    expect(policyNeeds(docs, []).map((n) => n.documentId)).toEqual(["p2", "t2"]);
  });
  it("skips a policy the signer already accepted at that version", () => {
    const needs = policyNeeds(docs, [{ document_id: "t2", accepted_at: "2026-10-01" }]);
    expect(policiesToRecord(needs, ["p2"])).toEqual(["p2"]);
  });
  it("asks again when only an older version was accepted", () => {
    expect(policyNeeds(docs, [{ document_id: "p1", accepted_at: "2026-01-01" }])[0]?.acceptedAt).toBeNull();
  });
  it("refuses to sign when a required box is unticked", () => {
    expect(() => policiesToRecord(policyNeeds(docs, []), ["p2"])).toThrow(/Terms & Conditions/);
  });
  it("short codes are 8 characters", () => {
    expect(shortCode()).toMatch(/^[A-Za-z0-9]{8}$/);
  });
});
