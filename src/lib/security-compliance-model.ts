/**
 * Harmonious Security & Compliance Center - pure model. It manages controls,
 * evidence, risks, policies and readiness. It never certifies Harmonious:
 * external assurance only follows a recorded external audit result.
 */

// ---------------------------------------------------------------- capabilities

export const SC_CAPABILITIES = [
  "security_compliance_view", "security_compliance_manage", "risk_manage", "evidence_view", "evidence_manage", "audit_manage", "trust_center_publish",
] as const;
export type ScCapability = (typeof SC_CAPABILITIES)[number];

/**
 * Capabilities from explicit roles and existing Compliance & Controls
 * permissions only. An email domain, Sales role or Fund Manager role grants nothing.
 */
export function scCapabilities(roles: readonly string[], adminPerms: readonly string[]): ScCapability[] {
  const r = new Set(roles);
  const p = new Set(adminPerms);
  if (r.has("super_admin")) return [...SC_CAPABILITIES];
  const out = new Set<ScCapability>();
  const manager = r.has("security_compliance_manager");
  if (manager) for (const c of SC_CAPABILITIES) if (c !== "trust_center_publish") out.add(c);
  if (r.has("security_compliance_viewer")) { out.add("security_compliance_view"); out.add("evidence_view"); }
  // Compatibility: existing Compliance & Controls holders keep equivalent access.
  if (p.has("administration.controls.view")) out.add("security_compliance_view");
  if (p.has("administration.controls.edit")) out.add("security_compliance_manage");
  if (p.has("administration.risks.manage")) out.add("risk_manage");
  if (p.has("administration.evidence.view")) out.add("evidence_view");
  if (p.has("administration.evidence.collect")) out.add("evidence_manage");
  return [...out];
}

// ---------------------------------------------------------------- control lifecycle

export const LIFECYCLE = [
  "not_assessed", "gap_identified", "remediation_planned", "implementation_in_progress", "implemented", "evidence_needed",
  "evidence_collected", "internal_review", "operating_effectively", "exception", "failed", "auditor_verified",
] as const;
export type Lifecycle = (typeof LIFECYCLE)[number];
export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  not_assessed: "Not Assessed", gap_identified: "Gap Identified", remediation_planned: "Remediation Planned",
  implementation_in_progress: "Implementation In Progress", implemented: "Implemented", evidence_needed: "Evidence Needed",
  evidence_collected: "Evidence Collected", internal_review: "Internal Review", operating_effectively: "Operating Effectively",
  exception: "Exception", failed: "Failed", auditor_verified: "Auditor Verified",
};

export type EvidenceFact = { reviewedAccepted: boolean; expiresOn: string | null; superseded: boolean };
export function evidenceCurrent(e: EvidenceFact, today: string): boolean {
  return e.reviewedAccepted && !e.superseded && (!e.expiresOn || e.expiresOn >= today);
}

/** Why a lifecycle move is refused, or null. Implementation never implies certification. */
export function lifecycleProblem(to: Lifecycle, ctx: { evidence: EvidenceFact[]; today: string; auditVerified: boolean }): string | null {
  if (to === "operating_effectively" && !ctx.evidence.some((e) => evidenceCurrent(e, ctx.today)))
    return "Operating Effectively needs at least one reviewed, accepted and unexpired evidence item linked to this control.";
  if (to === "evidence_collected" && !ctx.evidence.length) return "Link evidence before marking Evidence Collected.";
  if (to === "auditor_verified" && !ctx.auditVerified) return "Auditor Verified can only follow a recorded external audit result that covers this control.";
  return null;
}

export const CONTROL_DOMAINS: Record<string, string> = {
  IAM: "Identity & Access Management", LOG: "Logging & Monitoring", DSP: "Data Security & Privacy", PRV: "Privacy",
  GRC: "Governance, Risk & Compliance", HRS: "Human Resources Security", SEF: "Security Incident Management",
  TVM: "Threat & Vulnerability Management", STA: "Supply Chain & Vendor Management", BCR: "Business Continuity & Resilience",
  CEK: "Cryptography & Key Management", AIS: "Application Security", CCC: "Change Control", IVS: "Infrastructure Security",
};

// ---------------------------------------------------------------- risk

export const LIKELIHOOD = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"] as const;
export const IMPACT = ["Insignificant", "Minor", "Moderate", "Major", "Severe"] as const;
export const TREATMENTS = ["mitigate", "avoid", "transfer", "accept"] as const;

export function riskScore(l: number | null | undefined, i: number | null | undefined): number | null {
  if (!l || !i) return null;
  return l * i;
}
export function riskBand(score: number | null): "low" | "medium" | "high" | "critical" | "unassessed" {
  if (score == null) return "unassessed";
  if (score >= 20) return "critical";
  if (score >= 12) return "high";
  if (score >= 6) return "medium";
  return "low";
}

/** Acceptance needs a different approver (or Super Admin with recorded reason), a reason and an expiry. */
export function acceptanceProblem(a: { requestedBy: string | null; approver: string; selfApproved: boolean; reason: string; expires: string | null; today: string }): string | null {
  if (!a.reason || a.reason.trim().length < 10) return "Give a reason of at least 10 characters for accepting this risk.";
  if (!a.expires || a.expires <= a.today) return "Risk acceptance needs a future expiry/review date.";
  if (a.requestedBy === a.approver && !a.selfApproved) return "A different person must approve this risk acceptance.";
  return null;
}

// ---------------------------------------------------------------- policies

export const POLICY_STATUSES = ["draft", "review", "approved", "effective", "superseded", "retired"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];
const POLICY_NEXT: Record<PolicyStatus, PolicyStatus[]> = {
  draft: ["review", "retired"], review: ["draft", "approved"], approved: ["effective", "retired"],
  effective: ["superseded", "retired"], superseded: [], retired: [],
};
export function policyTransitionProblem(from: PolicyStatus | null, to: PolicyStatus): string | null {
  if (from == null) return to === "draft" ? null : "New policies start as Draft.";
  return POLICY_NEXT[from].includes(to) ? null : `A policy can't move from ${from} to ${to}.`;
}
/** Approved/effective text is immutable: edits must start a new version as Draft. */
export function policyEditProblem(current: PolicyStatus): string | null {
  return ["approved", "effective", "superseded", "retired"].includes(current) ? "This version is locked. Start a new version to make changes." : null;
}

export const POLICY_CATEGORIES = [
  "Information Security", "Access Control", "Acceptable Use", "Data Classification", "Data Retention", "Encryption",
  "Secure Development", "Change Management", "Vulnerability Management", "Incident Response", "Business Continuity",
  "Disaster Recovery", "Vendor Management", "Risk Management", "Privacy", "Employee Security", "Remote Work", "Backup",
  "Logging & Monitoring", "Authentication", "Asset Management",
] as const;

/** A category is covered only by an Effective (or Approved) policy; drafts remain gaps. */
export function policyCoverage(policies: { category: string; status: PolicyStatus }[]) {
  return POLICY_CATEGORIES.map((c) => {
    const ps = policies.filter((p) => p.category.toLowerCase() === c.toLowerCase());
    const state = ps.some((p) => p.status === "effective") ? "effective" : ps.some((p) => p.status === "approved") ? "approved" : ps.length ? "draft" : "missing";
    return { category: c, state };
  });
}

// ---------------------------------------------------------------- frameworks & assurance

export function frameworkReadiness(reqs: { id: string }[], mappings: { requirement_id: string; control_key: string }[], effective: Set<string>) {
  const total = reqs.length;
  const mapped = reqs.filter((r) => mappings.some((m) => m.requirement_id === r.id)).length;
  const operating = reqs.filter((r) => mappings.some((m) => m.requirement_id === r.id && effective.has(m.control_key))).length;
  return { total, mapped, gaps: total - mapped, operating, readiness: total ? Math.round((operating / total) * 100) : 0 };
}

export const ASSURANCE_STATUSES = ["planned", "in_preparation", "assessment_in_progress", "report_issued", "certified"] as const;
export type AssuranceStatus = (typeof ASSURANCE_STATUSES)[number];
export const ASSURANCE_LABEL: Record<AssuranceStatus, string> = {
  planned: "Planned", in_preparation: "In Preparation", assessment_in_progress: "Assessment In Progress", report_issued: "Report Issued", certified: "Certified",
};
export function assuranceProblem(status: AssuranceStatus, audit: { result: string; report_evidence_id: string | null; framework_key: string } | null, frameworkKey: string): string | null {
  if (status !== "report_issued" && status !== "certified") return null;
  if (!audit || audit.framework_key !== frameworkKey || !audit.report_evidence_id) return "Report Issued / Certified needs a recorded external audit for this framework with the report attached.";
  if (status === "certified" && audit.result !== "certified") return "Certified requires the audit result to be recorded as Certified.";
  if (status === "report_issued" && !["report_issued", "certified", "qualified"].includes(audit.result)) return "Report Issued requires an issued audit report.";
  return null;
}

export const PUBLICATION_STATES = ["internal_only", "approved", "published", "withdrawn"] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];
const PUB_NEXT: Record<PublicationState, PublicationState[]> = {
  internal_only: ["approved"], approved: ["published", "internal_only"], published: ["withdrawn"], withdrawn: ["internal_only"],
};
export function publicationProblem(from: PublicationState, to: PublicationState, a: { actor: string; editor: string | null; selfApproved: boolean }): string | null {
  if (!PUB_NEXT[from].includes(to)) return `Can't move from ${from} to ${to}.`;
  if (to === "approved" && a.editor === a.actor && !a.selfApproved) return "A different person must approve this for the Trust Center.";
  return null;
}

export const ACCESS_LEVEL_LABEL = { public: "Public", login_required: "Login Required", nda_required: "NDA / Approval Required", internal: "Internal Only" } as const;
export const SCOPE_ITEM_TYPES = ["legal_entity", "business_unit", "product", "application", "infrastructure", "environment", "data_store", "vendor", "employee_group", "location", "process"] as const;
