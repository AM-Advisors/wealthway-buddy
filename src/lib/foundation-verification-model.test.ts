import { describe, expect, it } from "vitest";
import { clientVerificationView, foundationRequirements, verificationSummary, type VerificationInput } from "@/lib/foundation-verification-model";

const gov = { id: "g1", kind: "governing_document", source: "staff" as const, superseded_by: null, review: null };
const letter = { id: "l1", kind: "determination_letter", source: "client" as const, superseded_by: null, review: "accepted" as const };
const resolution = { id: "r1", kind: "authority_evidence", source: "staff" as const, superseded_by: null, review: null };
const base: VerificationInput = {
  profile: { classification: "private_nonoperating_foundation", exemption_status: "determined", legal_structure: "nonprofit_corporation" },
  entity: { tax_id_status: "issued" },
  documents: [gov, letter, resolution],
  authority: [{ person_id: "p1", role: "trustee", authority_scopes: ["sign_agreements"], evidence_document_id: "r1", status: "active" }],
  persons: { p1: { name: "Quinn Rivera", kyc_status: "approved", aml_status: "approved" } },
  entityReview: null,
  components: ["onboarding_setup"],
};
const get = (i: VerificationInput, key: string) => foundationRequirements(i).find((r) => r.key === key)!;

describe("no automatic approval", () => {
  it("documents and EIN alone leave the foundation records waiting for a decision", () => expect(get(base, "entity_records").status).toBe("in_review"));
  it("exemption status alone never confirms exemption", () => expect(get(base, "exemption_evidence").status).toBe("in_review"));
  it("an explicit approval citing the letter satisfies both", () => {
    const i = { ...base, entityReview: { decision: "approved" as const, evidence_document_ids: ["g1", "l1"], note: "ok", created_at: "2026-11-01" } };
    expect(get(i, "entity_records").status).toBe("satisfied");
    expect(get(i, "exemption_evidence").status).toBe("satisfied");
  });
  it("replacing approved evidence reopens the decision", () => {
    const i = { ...base, documents: [{ ...gov, superseded_by: "g2" }, { ...gov, id: "g2" }, letter, resolution], entityReview: { decision: "approved" as const, evidence_document_ids: ["g1"], note: "ok", created_at: "2026-11-01" } };
    expect(get(i, "entity_records").status).toBe("in_review");
  });
  it("an unreviewed client upload is not evidence", () => {
    const i = { ...base, documents: [{ ...gov, source: "client" as const, review: null }] };
    expect(get(i, "entity_records").status).toBe("missing");
  });
  it("foundation screening stays unresolved until the existing screening process covers foundations", () => {
    const i = { ...base, entityReview: { decision: "approved" as const, evidence_document_ids: ["g1", "l1"], note: "ok", created_at: "2026-11-01" } };
    expect(get(i, "entity_screening").status).toBe("missing");
    expect(verificationSummary(foundationRequirements(i)).complete).toBe(false);
  });
});

describe("people and authority", () => {
  it("control persons need identity and screening from their own record", () => {
    const i = { ...base, persons: { p1: { name: "Quinn Rivera", kyc_status: "approved", aml_status: "pending" } } };
    expect(get(i, "person_identity:p1").status).toBe("satisfied");
    expect(get(i, "person_screening:p1").status).toBe("in_review");
  });
  it("person results use the same canonical words as fund rosters", () => {
    const i = { ...base, persons: { p1: { name: "Quinn Rivera", kyc_status: "verified", aml_status: "clear" } } };
    expect(get(i, "person_identity:p1").status).toBe("satisfied");
    expect(get(i, "person_screening:p1").status).toBe("satisfied");
    const hit = { ...base, persons: { p1: { name: "Quinn Rivera", kyc_status: "approved", aml_status: "match" } } };
    expect(get(hit, "person_screening:p1").status).toBe("exception");
    const blank = { ...base, persons: { p1: { name: "Quinn Rivera", kyc_status: "not_started", aml_status: null } } };
    expect(get(blank, "person_identity:p1").status).toBe("missing");
  });
  it("an unreadable person record stays unresolved", () => expect(get({ ...base, persons: {} }, "person_identity:p1").status).toBe("missing"));
  it("paperwork preparers need no checks and grant no authority", () => {
    const i = { ...base, authority: [{ person_id: "p2", role: "paperwork_preparer", authority_scopes: ["prepare_paperwork"], evidence_document_id: null, status: "active" }] };
    const reqs = foundationRequirements(i);
    expect(reqs.some((r) => r.personId === "p2")).toBe(false);
    expect(get(i, "authority:sign_agreements").status).toBe("missing");
  });
  it("no ownership percentages are asked for", () => expect(foundationRequirements(base).some((r) => /ownership percent/i.test(r.items.join(" ")))).toBe(false));
  it("grant administration needs a grant approver on record", () => expect(get({ ...base, components: ["grant_administration"] }, "authority:approve_grants").status).toBe("missing"));
  it("authority with unaccepted evidence is not satisfied", () => {
    const i = { ...base, documents: [gov, letter, { ...resolution, source: "client" as const, review: null }] };
    expect(get(i, "authority:sign_agreements").status).toBe("in_review");
  });
});

describe("client view", () => {
  it("hides screening details and decline notes", () => {
    const i = { ...base, persons: { p1: { name: "Quinn Rivera", kyc_status: "approved", aml_status: "declined" } }, entityReview: { decision: "declined" as const, evidence_document_ids: [], note: "Sanctions concern", created_at: "2026-11-01" } };
    const v = clientVerificationView(foundationRequirements(i));
    expect(JSON.stringify(v)).not.toMatch(/Sanctions|declined|unresolved result/i);
    expect(v.find((r) => r.key === "person_screening:p1")?.status).toBe("in_review");
  });

  it("a declined identity shows the client a follow-up, never in review or done, and without the reason", () => {
    const i = { ...base, persons: { p1: { name: "Quinn Rivera", kyc_status: "declined", aml_status: "approved" } } };
    const v = clientVerificationView(foundationRequirements(i));
    const id = v.find((r) => r.key === "person_identity:p1");
    expect(id?.status).toBe("follow_up");
    expect(id?.items).toEqual([]);
    expect(JSON.stringify(v)).not.toMatch(/exception|declined/i);
  });

  it("clear screening never satisfies the same person's identity check", () => {
    const i = { ...base, persons: { p1: { name: "Quinn Rivera", kyc_status: null, aml_status: "clear" } } };
    const reqs = foundationRequirements(i);
    expect(reqs.find((r) => r.key === "person_screening:p1")?.status).toBe("satisfied");
    expect(reqs.find((r) => r.key === "person_identity:p1")?.status).toBe("missing");
  });
});
