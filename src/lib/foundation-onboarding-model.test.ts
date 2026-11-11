import { describe, expect, it } from "vitest";
import { changedSinceSubmission, clientFoundationAccess, onboardingChecklist, proposedChanges, reviewProblem, clientFactsSchema } from "@/lib/foundation-onboarding-model";

describe("client foundation access", () => {
  it("is off until both switches are on", () => expect(clientFoundationAccess({ client_role: "client_gp", revoked_at: null }, false).read).toBe(false));
  it("needs active membership of the exact client", () => {
    expect(clientFoundationAccess(null, true).problem).toBe("Foundation not found.");
    expect(clientFoundationAccess({ client_role: "client_gp", revoked_at: "2026-01-01" }, true).read).toBe(false);
  });
  it("read-only members can view but not submit", () => {
    const a = clientFoundationAccess({ client_role: "client_readonly", revoked_at: null }, true);
    expect([a.read, a.write]).toEqual([true, false]);
  });
  it("other members can submit", () => expect(clientFoundationAccess({ client_role: "client_gp", revoked_at: null }, true).write).toBe(true));
});

describe("submissions never approve themselves or overwrite silently", () => {
  it("the submitter can't review their own submission", () => {
    expect(reviewProblem({ reviewerId: "u1", submitterId: "u1", decision: "accepted", note: null, status: "submitted" })).toMatch(/never approves itself/);
  });
  it("a decided submission can't be decided again", () => {
    expect(reviewProblem({ reviewerId: "u2", submitterId: "u1", decision: "accepted", note: null, status: "accepted" })).toMatch(/already decided/);
  });
  it("a correction request needs a note", () => {
    expect(reviewProblem({ reviewerId: "u2", submitterId: "u1", decision: "correction_requested", note: "", status: "submitted" })).toMatch(/corrected/);
    expect(reviewProblem({ reviewerId: "u2", submitterId: "u1", decision: "accepted", note: null, status: "submitted" })).toBeNull();
  });
  it("only changed fields are proposed", () => {
    const c = proposedChanges({ mission: "A", fiscal_year_end_month: 12, classification: "unknown" }, { mission: "A", fiscal_year_end_month: 6, classification: "unknown" });
    expect(c).toEqual([{ field: "fiscal_year_end_month", from: "12", to: "6" }]);
  });
  it("flags fields staff changed after the client submitted", () => {
    const changes = [{ field: "mission" as const, from: "A", to: "B" }];
    expect(changedSinceSubmission({ mission: "A" }, { mission: "Staff edit" }, changes)).toEqual(["mission"]);
    expect(changedSinceSubmission({ mission: "A" }, { mission: "A" }, changes)).toEqual([]);
  });
  it("clients can't propose the entity, client or EIN", () => {
    expect(clientFactsSchema.safeParse({ client_entity_id: "x" }).success).toBe(false);
    expect(clientFactsSchema.safeParse({ tax_id: "123456789" }).success).toBe(false);
  });
});

describe("onboarding checklist", () => {
  const base = { profile: { classification: "unknown", exemption_status: "unknown", fiscal_year_end_month: null, mission: null }, entity: { tax_id_status: null }, authority: [], submissions: [] };
  it("a pending client upload is with Harmonious, not done", () => {
    const items = onboardingChecklist({ ...base, documents: [{ id: "d1", kind: "governing_document", source: "client", superseded_by: null, review: null }] });
    expect(items.find((i) => i.key === "governing_document")?.status).toBe("in_review");
  });
  it("a correction request shows the reviewer's note", () => {
    const items = onboardingChecklist({ ...base, documents: [{ id: "d1", kind: "governing_document", source: "client", superseded_by: null, review: "correction_requested", reviewNote: "Signed copy please" }] });
    expect(items.find((i) => i.key === "governing_document")).toMatchObject({ status: "correction", note: "Signed copy please" });
  });
  it("an accepted upload is done", () => {
    const items = onboardingChecklist({ ...base, documents: [{ id: "d1", kind: "governing_document", source: "client", superseded_by: null, review: "accepted" }] });
    expect(items.find((i) => i.key === "governing_document")?.status).toBe("done");
  });
});
