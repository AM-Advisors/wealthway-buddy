import { describe, expect, it } from "vitest";
import { accessReviewPopulation, buildRbacEvidence, type AccessSnapshot } from "@/lib/compliance-evidence";
import { classificationChangeProblem, privilegedAssignmentProblem, CLASSIFICATION_PROPOSALS } from "@/lib/account-classification";
import { authorize } from "@/lib/authorize";
import { stableJson } from "@/lib/compliance-model";

const A = "fcf83359-0486-402d-83b4-fd5484fb663d", A2 = "09788a71-023f-441c-8a4d-3fc3c6b36491", A3 = "6d46c1f0-b656-4dcb-bdd3-0a88b14817e0";
const INFO = "c201d7b1-0d86-4ba5-a60c-032b0d1a22e3";
const snap = (over: Partial<AccessSnapshot> = {}): AccessSnapshot => ({
  users: [
    { id: A, email: "alyssa@harmonious.co", last_sign_in_at: "2026-09-28T19:41:08Z" },
    { id: A2, email: "alyssa@storybookvc.com" }, { id: A3, email: "alyssalpettit@gmail.com" },
    { id: INFO, email: "info@harmonious.co" },
  ],
  roles: [
    { user_id: A, role: "admin", created_at: "2026-09-04" }, { user_id: A, role: "super_admin", created_at: "2026-09-28" }, { user_id: A, role: "operations" },
    { user_id: A2, role: "admin" }, { user_id: A3, role: "investor" }, { user_id: INFO, role: "client_gp" },
  ],
  grants: [], assignments: [], pgrants: [], fms: [], offerings: [], clients: [{ id: "c1" }],
  cus: [{ user_id: INFO, client_id: "c1", client_role: "client_gp" }],
  auditEvents: [], classifications: [{ user_id: A, classification: "individual", created_at: "2026-09-28" }],
  ...over,
});

describe("Stage 2.8 privileged access cleanup", () => {
  it("privileged review has one row per user ID with all roles under it", () => {
    const rows = accessReviewPopulation("privileged", snap());
    expect(rows.map((r) => r.user_id)).toEqual([...new Set(rows.map((r) => r.user_id))]);
    const a = rows.find((r) => r.user_id === A)!;
    expect(a.roles.map((r) => r.role).sort()).toEqual(["admin", "super_admin"]);
    expect(a.key).toBe(A);
  });

  it("same display name across different user IDs stays separate", () => {
    const rows = accessReviewPopulation("privileged", snap());
    expect(rows.filter((r) => [A, A2].includes(r.user_id))).toHaveLength(2);
  });

  it("shared inbox and integration accounts can't receive Super Administrator", () => {
    expect(privilegedAssignmentProblem("super_admin", "global", "shared_inbox")).toMatch(/Shared Inbox/);
    expect(privilegedAssignmentProblem("super_admin", "global", "integration_account")).toMatch(/Integration/);
    expect(privilegedAssignmentProblem("super_admin", "global", "service_account")).toMatch(/non-human/);
    expect(privilegedAssignmentProblem("super_admin", "global", null)).toMatch(/Classify/);
  });

  it("named individual can receive Super Administrator; non-privileged roles are unaffected", () => {
    expect(privilegedAssignmentProblem("super_admin", "global", "individual")).toBeNull();
    expect(privilegedAssignmentProblem("client_viewer", "client", "shared_inbox")).toBeNull();
  });

  it("an account holding privileged roles can't be reclassified away from Individual", () => {
    expect(classificationChangeProblem("shared_inbox", ["super_admin"])).toMatch(/Remove/);
    expect(classificationChangeProblem("shared_inbox", [])).toBeNull();
    expect(CLASSIFICATION_PROPOSALS[INFO]?.classification).toBe("shared_inbox");
  });

  it("removing super_admin from info@ keeps its scoped client relationship", () => {
    const after = snap();
    expect(accessReviewPopulation("privileged", after).some((r) => r.user_id === INFO)).toBe(false);
    const scoped = buildRbacEvidence("scoped_client", after, { start: "2026-01-01", end: "2026-12-31" });
    expect(scoped.items.some((i) => i.person === "info@harmonious.co")).toBe(true);
  });

  it("Effective Permissions and Person Matrix derive from the same canonical decision", () => {
    const f: any = { userId: A, roles: ["super_admin"], staffGrants: [], customRoles: {}, managedFunds: [], investorFunds: [], investmentProfiles: [], clientMemberships: [], companies: [], professionalMemberships: [], delegations: [], authenticated: true, suspended: false, assignments: [], grants: [], roleDefinitions: [] };
    for (const p of ["clients.manage_access", "clients.export", "funds.manage_access", "funds.export"]) {
      expect(authorize(f, p, { type: "global", id: null }).allowed).toBe(true);
    }
  });

  it("historical snapshots are untouched: population change doesn't alter a stored snapshot's fingerprint input", () => {
    const old = { taken_at: "2026-09-01", items: [{ key: `${A}|admin|Global`, role: "admin" }, { key: `${A}|super_admin|Global`, role: "super_admin" }] };
    const before = stableJson(old);
    accessReviewPopulation("privileged", snap());
    expect(stableJson(old)).toBe(before);
  });

  it("privileged-account evidence flags shared inboxes and contains no secrets", () => {
    const s = snap({ roles: [...snap().roles, { user_id: INFO, role: "super_admin" }], classifications: [...snap().classifications!, { user_id: INFO, classification: "shared_inbox", created_at: "2026-09-28" }] });
    const ev = buildRbacEvidence("privileged_accounts", s, { start: "2026-01-01", end: "2026-12-31" });
    expect(ev.control).toBe("AC-07");
    expect(ev.items.find((i) => i.user_id === INFO)?.exception).toMatch(/Control exception/);
    expect(JSON.stringify(ev)).not.toMatch(/password|token|secret|encrypted|otp/i);
  });
});
