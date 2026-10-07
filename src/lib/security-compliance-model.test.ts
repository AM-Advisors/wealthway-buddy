import { describe, expect, it } from "vitest";

import {
  acceptanceProblem, assuranceProblem, frameworkReadiness, lifecycleProblem, policyCoverage, policyEditProblem,
  policyTransitionProblem, publicationProblem, riskBand, riskScore, scCapabilities,
} from "./security-compliance-model";

const today = "2026-10-07";

describe("capabilities", () => {
  it("grants nothing to sales or fund managers", () => {
    expect(scCapabilities(["sales", "fund_manager"], [])).toEqual([]);
  });
  it("super admin gets publish; manager does not", () => {
    expect(scCapabilities(["super_admin"], [])).toContain("trust_center_publish");
    expect(scCapabilities(["security_compliance_manager"], [])).not.toContain("trust_center_publish");
  });
  it("keeps legacy Compliance & Controls viewers", () => {
    expect(scCapabilities([], ["administration.controls.view"])).toEqual(["security_compliance_view"]);
  });
});

describe("control lifecycle", () => {
  it("needs current reviewed evidence to operate effectively", () => {
    expect(lifecycleProblem("operating_effectively", { evidence: [], today, auditVerified: false })).toBeTruthy();
    expect(lifecycleProblem("operating_effectively", { evidence: [{ reviewedAccepted: true, expiresOn: "2026-01-01", superseded: false }], today, auditVerified: false })).toBeTruthy();
    expect(lifecycleProblem("operating_effectively", { evidence: [{ reviewedAccepted: true, expiresOn: null, superseded: false }], today, auditVerified: false })).toBeNull();
  });
  it("implemented never needs or implies audit", () => {
    expect(lifecycleProblem("implemented", { evidence: [], today, auditVerified: false })).toBeNull();
    expect(lifecycleProblem("auditor_verified", { evidence: [], today, auditVerified: false })).toBeTruthy();
  });
});

describe("risk", () => {
  it("scores and bands", () => {
    expect(riskScore(5, 5)).toBe(25);
    expect(riskBand(25)).toBe("critical");
    expect(riskBand(riskScore(null, 3))).toBe("unassessed");
  });
  it("acceptance needs second person, reason, expiry", () => {
    const base = { requestedBy: "a", approver: "b", selfApproved: false, reason: "Compensating controls in place", expires: "2027-01-01", today };
    expect(acceptanceProblem(base)).toBeNull();
    expect(acceptanceProblem({ ...base, approver: "a" })).toBeTruthy();
    expect(acceptanceProblem({ ...base, approver: "a", selfApproved: true })).toBeNull();
    expect(acceptanceProblem({ ...base, expires: null })).toBeTruthy();
  });
});

describe("policies", () => {
  it("follows lifecycle and locks approved text", () => {
    expect(policyTransitionProblem("draft", "effective")).toBeTruthy();
    expect(policyTransitionProblem("approved", "effective")).toBeNull();
    expect(policyEditProblem("approved")).toBeTruthy();
    expect(policyEditProblem("draft")).toBeNull();
  });
  it("drafts are still gaps", () => {
    const c = policyCoverage([{ category: "Access Control", status: "draft" }]);
    expect(c.find((x) => x.category === "Access Control")?.state).toBe("draft");
    expect(c.find((x) => x.category === "Backup")?.state).toBe("missing");
  });
});

describe("assurance", () => {
  it("never certifies without a recorded audit result", () => {
    expect(assuranceProblem("certified", null, "soc2")).toBeTruthy();
    expect(assuranceProblem("certified", { result: "report_issued", report_evidence_id: "e", framework_key: "soc2" }, "soc2")).toBeTruthy();
    expect(assuranceProblem("certified", { result: "certified", report_evidence_id: "e", framework_key: "soc2" }, "soc2")).toBeNull();
    expect(assuranceProblem("in_preparation", null, "soc2")).toBeNull();
  });
  it("publishing needs a second approver", () => {
    expect(publicationProblem("internal_only", "approved", { actor: "a", editor: "a", selfApproved: false })).toBeTruthy();
    expect(publicationProblem("internal_only", "published", { actor: "b", editor: "a", selfApproved: false })).toBeTruthy();
    expect(publicationProblem("approved", "published", { actor: "b", editor: "a", selfApproved: false })).toBeNull();
  });
  it("readiness counts only effective controls", () => {
    const r = frameworkReadiness([{ id: "1" }, { id: "2" }], [{ requirement_id: "1", control_key: "A" }], new Set(["A"]));
    expect(r).toEqual({ total: 2, mapped: 1, gaps: 1, operating: 1, readiness: 50 });
  });
});
