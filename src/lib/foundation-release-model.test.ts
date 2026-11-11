import { describe, expect, it } from "vitest";
import { releaseApprovalProblem, releaseRequestProblem, releaseState, releasedSets, type ReleaseEvent } from "@/lib/foundation-release-model";
import { foundationReleaseBlocker } from "@/lib/foundation-admin-model";

const ev = (o: Partial<ReleaseEvent>): ReleaseEvent => ({ id: Math.random().toString(36).slice(2), component: "onboarding_setup", dimension: "delivery", action: "requested", request_id: null, evidence: {}, reason: "Because we validated it", actor_id: "a1", created_at: "2026-11-01T00:00:00Z", ...o });
const full = { terms: "SOW v1 approved by legal", pricing_policy: "Negotiated policy approved by CEO", verification: "Requirements matrix approved", delivery_workflow: "Ops runbook v1 approved", validation: "QA run 2026-11-10 passed" };
const empty = { released: false, openRequest: null, lastDecision: null };

describe("nothing is released by default", () => {
  it("no events means nothing is released", () => expect(releasedSets([])).toEqual({ commercial: [], delivery: [] }));
  it("every action stays blocked with nothing released", () => {
    for (const a of ["send", "contract", "sign", "invoice"] as const) expect(foundationReleaseBlocker([{ service_key: "FOUNDATION_ADMIN:onboarding_setup" }], a)).toMatch(/isn't released/);
  });
});

describe("release requests need evidence", () => {
  it("commercial release needs all five pieces of evidence", () => {
    expect(releaseRequestProblem({ component: "onboarding_setup", dimension: "commercial", evidence: { ...full, validation: "" }, reason: "Ready to sell this", roles: ["admin"], state: empty })).toMatch(/Validation evidence/);
    expect(releaseRequestProblem({ component: "onboarding_setup", dimension: "commercial", evidence: full, reason: "Ready to sell this", roles: ["admin"], state: empty })).toBeNull();
  });
  it("only administrators request", () => expect(releaseRequestProblem({ component: "onboarding_setup", dimension: "delivery", evidence: full, reason: "Ready to deliver", roles: ["operations"], state: empty })).toMatch(/administrator/));
  it("a reason is required", () => expect(releaseRequestProblem({ component: "onboarding_setup", dimension: "delivery", evidence: full, reason: "ok", roles: ["admin"], state: empty })).toMatch(/reason/));
});

describe("approval is maker-checker and ordered", () => {
  const req = ev({ id: "r1", actor_id: "a1" });
  it("the requester can't approve", () => expect(releaseApprovalProblem({ request: req, approverId: "a1", roles: ["super_admin"], deliveryReleased: false })).toMatch(/other than the requester/));
  it("only a Super Admin approves", () => expect(releaseApprovalProblem({ request: req, approverId: "a2", roles: ["admin"], deliveryReleased: false })).toMatch(/Super Admin/));
  it("commercial release waits for delivery readiness", () => expect(releaseApprovalProblem({ request: ev({ dimension: "commercial" }), approverId: "a2", roles: ["super_admin"], deliveryReleased: false })).toMatch(/delivery readiness/));
});

describe("release state", () => {
  it("an approval releases that component and dimension only", () => {
    const events = [ev({ id: "r1" }), ev({ id: "x1", action: "approved", request_id: "r1", actor_id: "a2", created_at: "2026-11-02T00:00:00Z" })];
    const s = releasedSets(events);
    expect(s.delivery).toEqual(["onboarding_setup"]);
    expect(s.commercial).toEqual([]);
    expect(foundationReleaseBlocker([{ service_key: "FOUNDATION_ADMIN:onboarding_setup" }], "invoice", s)).toMatch(/isn't released/);
  });
  it("invoicing needs both commercial and delivery release", () => {
    expect(foundationReleaseBlocker([{ service_key: "FOUNDATION_ADMIN:onboarding_setup" }], "invoice", { commercial: ["onboarding_setup"], delivery: [] })).toMatch(/isn't released/);
    expect(foundationReleaseBlocker([{ service_key: "FOUNDATION_ADMIN:onboarding_setup" }], "send", { commercial: ["onboarding_setup"], delivery: [] })).toBeNull();
  });
  it("a later revocation wins", () => {
    const events = [ev({ id: "r1" }), ev({ action: "approved", request_id: "r1", actor_id: "a2", created_at: "2026-11-02T00:00:00Z" }), ev({ action: "revoked", actor_id: "a2", created_at: "2026-11-03T00:00:00Z" })];
    expect(releaseState(events).onboarding_setup.delivery.released).toBe(false);
  });
  it("an open request is tracked until approved or withdrawn", () => {
    const events = [ev({ id: "r1" }), ev({ action: "withdrawn", request_id: "r1", created_at: "2026-11-02T00:00:00Z" })];
    expect(releaseState(events).onboarding_setup.delivery.openRequest).toBeNull();
    expect(releaseState([ev({ id: "r2" })]).onboarding_setup.delivery.openRequest?.id).toBe("r2");
  });
});
