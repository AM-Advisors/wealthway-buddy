/**
 * Stage 2.7 — Compliance & Controls (pure model). Records how controls are
 * designed and operated; it never certifies SOC 2 or GDPR compliance, never
 * decides legal questions, and never changes the systems it describes.
 */

export const CONTROL_TYPES = ["preventive", "detective", "corrective", "administrative", "technical"] as const;
export const FREQUENCIES = ["continuous", "per_event", "daily", "weekly", "monthly", "quarterly", "annually", "on_change"] as const;
export const CONTROL_STATUSES = ["designed", "implemented", "operating", "tested", "exception", "remediation"] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];
export const STATUS_LABEL: Record<ControlStatus, string> = {
  designed: "Designed", implemented: "Implemented", operating: "Operating", tested: "Tested", exception: "Exception", remediation: "Remediation",
};
export const FREQUENCY_DAYS: Record<string, number | null> = {
  continuous: 90, per_event: null, daily: 1, weekly: 7, monthly: 31, quarterly: 92, annually: 366, on_change: null,
};

// ---------------------------------------------------------------- frameworks (extensible: add rows, no redesign)

export type Requirement = { framework: string; code: string; title: string };
export const BASELINE_REQUIREMENTS: Requirement[] = [
  { framework: "SOC 2", code: "Security", title: "Security (Common Criteria)" },
  { framework: "SOC 2", code: "Availability", title: "Availability" },
  { framework: "SOC 2", code: "Processing Integrity", title: "Processing Integrity" },
  { framework: "SOC 2", code: "Confidentiality", title: "Confidentiality" },
  { framework: "SOC 2", code: "Privacy", title: "Privacy" },
  { framework: "GDPR", code: "Accountability", title: "Accountability" },
  { framework: "GDPR", code: "By design/default", title: "Privacy by design and by default" },
  { framework: "GDPR", code: "Minimization", title: "Data minimization" },
  { framework: "GDPR", code: "Purpose limitation", title: "Purpose limitation" },
  { framework: "GDPR", code: "Security", title: "Security of processing" },
  { framework: "GDPR", code: "Storage limitation", title: "Storage limitation" },
  { framework: "GDPR", code: "Data-subject rights", title: "Data-subject rights" },
  { framework: "GDPR", code: "Processors", title: "Processor / subprocessor governance" },
  { framework: "GDPR", code: "Transfers", title: "International data transfers" },
  { framework: "GDPR", code: "DPIA", title: "Data protection impact assessments" },
];

// ---------------------------------------------------------------- seeded controls (describe what exists; status = evidence-backed only)

export type BaselineControl = {
  key: string; name: string; objective: string; description: string; type: (typeof CONTROL_TYPES)[number];
  system: string; frequency: (typeof FREQUENCIES)[number]; evidence: string; implementation: string;
  evidenceAvailable: string; evidenceMissing: string; mappings: string[]; // "SOC 2:Security"
  /** Status supportable today without collected, reviewed evidence. Never operating/tested. */
  status: "designed" | "implemented";
};
const S = "SOC 2:", G = "GDPR:";
export const BASELINE_CONTROLS: BaselineControl[] = [
  { key: "AC-01", name: "Explicit account authorization", type: "preventive", system: "Access Control", frequency: "per_event",
    objective: "Only explicitly authorized accounts receive access.", description: "Access is assigned to an exact authenticated user and is never automatically granted based on email domain.",
    evidence: "User and role assignments; access audit events; denied access attempts.", implementation: "Canonical resolver; role assignments bound to user IDs; access audit log.",
    evidenceAvailable: "Role assignments, access_audit_events, refused changes", evidenceMissing: "Periodic reviewed evidence sample", mappings: [`${S}Security`, `${G}Security`, `${G}Accountability`], status: "implemented" },
  { key: "AC-02", name: "Scoped role-based access", type: "preventive", system: "Access Control", frequency: "continuous",
    objective: "Least privilege across Client, Fund, Company, Investor and staff access.", description: "Access is restricted by role, atomic permission and resource scope.",
    evidence: "Effective-permission snapshot; scoped assignments; explicit denies.", implementation: "authorize() with scope resolver and atomic permissions.",
    evidenceAvailable: "Effective-permission snapshots (generated)", evidenceMissing: "Reviewed quarterly snapshot", mappings: [`${S}Security`, `${S}Confidentiality`, `${G}Minimization`, `${G}By design/default`], status: "implemented" },
  { key: "AC-03", name: "Super Administrator assignment", type: "preventive", system: "Access Control", frequency: "per_event",
    objective: "Privileged administration is explicitly assigned.", description: "Super Administrator is assigned to exact authenticated users and cannot result from domain or email membership.",
    evidence: "Super Administrator population snapshot; assignment audit.", implementation: "user_roles rows; Super-Admin-only role grants.",
    evidenceAvailable: "Super Administrator snapshot (generated)", evidenceMissing: "Privileged access review completion", mappings: [`${S}Security`], status: "implemented" },
  { key: "AC-07", name: "Privileged accounts assigned to identifiable individuals", type: "preventive", system: "Access Control", frequency: "per_event",
    objective: "Every privileged administrative account belongs to one identifiable person.", description: "Privileged administrative accounts are assigned to identifiable individuals. Shared inboxes and integration accounts can't hold privileged roles; service accounts get only approved non-human capabilities.",
    evidence: "Privileged-account snapshot: user ID, account classification, privileged roles, grantor, grant date, last sign-in, active state.", implementation: "Explicit, audited account classification; server and database refuse privileged roles for non-Individual accounts.",
    evidenceAvailable: "Privileged-account snapshot (generated)", evidenceMissing: "Reviewed snapshot; classification of every privileged account", mappings: [`${S}Security`, `${G}Accountability`], status: "implemented" },
  { key: "AC-04", name: "Maker/checker", type: "preventive", system: "Workflows", frequency: "per_event",
    objective: "Nobody approves their own preparation where separation is required.", description: "Existing specialized maker-checker checks block self-approval.",
    evidence: "Approval records showing distinct preparer and approver.", implementation: "Workflow-specific second-person approval checks.",
    evidenceAvailable: "Approval records in individual workflows", evidenceMissing: "Consolidated sample evidence", mappings: [`${S}Processing Integrity`, `${S}Security`], status: "implemented" },
  { key: "AC-05", name: "Access expiration and revocation", type: "corrective", system: "Access Control", frequency: "continuous",
    objective: "Access ends when it should.", description: "Assignments carry effective/expiry dates, revocation and suspension, all audited.",
    evidence: "Expired and revoked assignments; suspended users; audit trail.", implementation: "Time-bounded, revoke-only assignments and grants.",
    evidenceAvailable: "Expired/revoked/suspended snapshot (generated)", evidenceMissing: "Leaver checklist evidence", mappings: [`${S}Security`, `${G}Security`], status: "implemented" },
  { key: "AC-06", name: "Fail-closed resource scoping", type: "technical", system: "Access Control", frequency: "continuous",
    objective: "Unclear scope never grants access.", description: "Null, invalid or mismatched resource scope grants nothing.",
    evidence: "Automated tests; orphaned-access snapshot.", implementation: "Scope resolver denies null/invalid scope.",
    evidenceAvailable: "Test suite; Needs Review items", evidenceMissing: "Reviewed evidence record", mappings: [`${S}Security`, `${G}By design/default`], status: "implemented" },
  { key: "AR-01", name: "Periodic access review", type: "detective", system: "Compliance & Controls", frequency: "quarterly",
    objective: "Access is periodically certified by a reviewer.", description: "Scheduled access-review campaigns snapshot population and record decisions.",
    evidence: "Completed review campaign with snapshot and decisions.", implementation: "Access Reviews (Stage 2.7).",
    evidenceAvailable: "None yet", evidenceMissing: "First completed campaign", mappings: [`${S}Security`, `${G}Accountability`], status: "designed" },
  { key: "LG-01", name: "Immutable access-change audit", type: "detective", system: "Access Control", frequency: "per_event",
    objective: "Access changes are always traceable.", description: "Access changes and refused privileged changes produce append-only audit evidence.",
    evidence: "access_audit_events with before/after and refusals.", implementation: "Append-only audit table with mutation block.",
    evidenceAvailable: "Access change and refusal snapshots (generated)", evidenceMissing: "Reviewed log sample", mappings: [`${S}Security`, `${G}Accountability`], status: "implemented" },
  { key: "PR-01", name: "Sensitive-data segregation", type: "preventive", system: "Access Control / Tax / Onboarding", frequency: "continuous",
    objective: "Highly restricted data is outside generic grants.", description: "Full tax IDs, sensitive tax evidence, government ID, raw KYC/provider evidence, money execution and legal authority remain outside generic RBAC grants.",
    evidence: "Protected-permission list; tests; sensitive-assignment snapshot.", implementation: "PROTECTED_PERMISSIONS never granted by roles or grants.",
    evidenceAvailable: "Tests; sensitive-assignment snapshot (generated)", evidenceMissing: "Reviewed evidence record", mappings: [`${S}Confidentiality`, `${S}Privacy`, `${G}Security`, `${G}Minimization`], status: "implemented" },
  { key: "DI-01", name: "Records retention versus deletion", type: "preventive", system: "Clients / Funds lifecycle", frequency: "per_event",
    objective: "Records with permanent history are not hard deleted.", description: "Active Clients and Funds with permanent operational history can't be hard deleted; archive/lifecycle controls are used.",
    evidence: "Delete-draft eligibility rule; tests.", implementation: "Stage 2.6 delete-draft eligibility (vocabulary; endpoints not yet switched).",
    evidenceAvailable: "Tests", evidenceMissing: "Live endpoint enforcement (Stage 3)", mappings: [`${S}Processing Integrity`, `${G}Storage limitation`], status: "designed" },
  { key: "VM-01", name: "Vendor and subprocessor review", type: "administrative", system: "Vendors", frequency: "annually",
    objective: "Vendors handling data are reviewed.", description: "Vendors carry DPA status, security review and next-review dates.",
    evidence: "Vendor register entries with review dates.", implementation: "Vendors register (Stage 2.7) linked to providers.",
    evidenceAvailable: "Provider records", evidenceMissing: "DPA and security review records", mappings: [`${S}Security`, `${G}Processors`, `${G}Transfers`], status: "designed" },
  { key: "RT-01", name: "Retention schedule review", type: "administrative", system: "Privacy", frequency: "annually",
    objective: "Retention is justified and reviewed.", description: "Each record type has a retention basis, period, trigger and hold status.",
    evidence: "Reviewed retention schedule.", implementation: "Retention register (policy only; no automatic deletion).",
    evidenceAvailable: "None yet", evidenceMissing: "Approved schedule", mappings: [`${G}Storage limitation`, `${S}Privacy`], status: "designed" },
  { key: "IR-01", name: "Incident response", type: "corrective", system: "Incidents", frequency: "per_event",
    objective: "Incidents are contained, investigated and assessed by people.", description: "Incident register with human notification assessment.",
    evidence: "Incident records with closure and lessons learned.", implementation: "Incident register (Stage 2.7).",
    evidenceAvailable: "None yet", evidenceMissing: "Response procedure and exercised incident", mappings: [`${S}Security`, `${S}Availability`, `${G}Security`], status: "designed" },
  { key: "RA-01", name: "Risk assessment", type: "administrative", system: "Risks", frequency: "annually",
    objective: "Risks are identified, treated and owned.", description: "Risk register with inherent/residual risk and approved treatment.",
    evidence: "Reviewed risk register.", implementation: "Risk register (Stage 2.7).",
    evidenceAvailable: "None yet", evidenceMissing: "Completed assessment", mappings: [`${S}Security`, `${G}Accountability`], status: "designed" },
];

// ---------------------------------------------------------------- status rules

export type EvidenceLite = { id: string; control_key: string; collected_by: string | null; reviews: { decision: string; reviewer_user_id: string }[] };

/** Status claims must be backed: code existing ≠ operating. */
export function statusProblem(status: ControlStatus, evidence: EvidenceLite[], evidenceId?: string | null): string | null {
  if (status === "operating" || status === "tested") {
    const ev = evidence.find((e) => e.id === evidenceId);
    if (!ev) return `${STATUS_LABEL[status]} needs a linked evidence record.`;
    if (status === "tested" && !ev.reviews.some((r) => r.decision === "accepted")) return "Tested needs evidence a reviewer has accepted.";
  }
  if (status === "exception" && !evidenceId) return "Link the evidence or test that found the exception.";
  return null;
}

/** Separation of duties: the collector/operator never reviews their own evidence, whatever permissions they hold. */
export function evidenceReviewProblem(o: { reviewerId: string; collectedBy: string | null; operatorId: string | null; sodRequired: boolean; alreadyReviewedByMe: boolean }): string | null {
  if (o.sodRequired && (o.reviewerId === o.collectedBy || o.reviewerId === o.operatorId)) return "The operator or collector can't review this evidence — a different person must.";
  if (o.alreadyReviewedByMe) return "You've already reviewed this evidence; add a new version instead.";
  return null;
}

export function nextDue(lastPerformed: string | null, frequency: string, effectiveAt: string): string | null {
  const d = FREQUENCY_DAYS[frequency];
  if (!d) return null;
  const base = new Date(lastPerformed ?? effectiveAt);
  return new Date(base.getTime() + d * 86400000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- registers

export type FieldSpec = { key: string; label: string; type?: "text" | "long" | "date" | "select" | "bool" | "person"; options?: string[]; required?: boolean; humanOnly?: boolean };
export type RegisterSpec = { kind: string; label: string; prefix: string; statuses: string[]; fields: FieldSpec[]; note?: string };

export const CLASSIFICATIONS = ["Public", "Internal", "Confidential", "Restricted", "Highly Restricted"];
const opt = (...o: string[]) => o;

export const REGISTERS: Record<string, RegisterSpec> = {
  data_map: { kind: "data_map", label: "Data Map", prefix: "DM", statuses: opt("draft", "approved", "retired"),
    note: "Describes categories only — never store personal data here.",
    fields: [
      { key: "systems", label: "Systems containing it", required: true }, { key: "purpose", label: "Purpose", required: true },
      { key: "classification", label: "Classification", type: "select", options: CLASSIFICATIONS, required: true },
      { key: "users", label: "Applicable users" }, { key: "storage", label: "Storage location/category" },
      { key: "recipients", label: "Recipients" }, { key: "retention", label: "Retention category" },
    ] },
  processing: { kind: "processing", label: "Processing Activities", prefix: "PA", statuses: opt("draft", "approved", "retired"),
    note: "Lawful basis and controller/processor role must be set and approved by the privacy/legal owner — the software never decides them.",
    fields: [
      { key: "purpose", label: "Business purpose", required: true },
      { key: "role", label: "Controller/processor role", type: "select", options: ["Controller", "Processor", "Joint controller", "Undetermined"], humanOnly: true },
      { key: "subjects", label: "Data subjects" }, { key: "data", label: "Personal data categories" },
      { key: "lawful_basis", label: "Lawful / documented basis", humanOnly: true }, { key: "recipients", label: "Recipients" },
      { key: "processors", label: "Processors/subprocessors" }, { key: "geography", label: "Processing/storage geography" },
      { key: "transfer", label: "Transfer mechanism/reference" }, { key: "retention", label: "Retention" },
      { key: "safeguards", label: "Safeguards", type: "long" }, { key: "controls", label: "Control references" },
      { key: "owner", label: "Owner", type: "person", required: true }, { key: "approved_by", label: "Approved by (privacy/legal)", type: "person" },
      { key: "review_date", label: "Review date", type: "date" },
    ] },
  retention: { kind: "retention", label: "Retention", prefix: "RS", statuses: opt("draft", "approved", "under_review"),
    note: "Policy and workflow only — nothing is deleted automatically. Retention disposition is not the same as deleting an unused draft.",
    fields: [
      { key: "classification", label: "Classification", type: "select", options: CLASSIFICATIONS, required: true },
      { key: "purpose", label: "Purpose" }, { key: "basis", label: "Retention basis", required: true },
      { key: "period", label: "Retention period", required: true }, { key: "trigger", label: "Trigger event" },
      { key: "hold", label: "Legal/regulatory hold", type: "bool" },
      { key: "disposition", label: "Disposition action", type: "select", options: ["delete", "anonymize", "archive", "retain_obligation"] },
      { key: "owner", label: "Owner", type: "person" }, { key: "last_reviewed", label: "Last reviewed", type: "date" }, { key: "next_review", label: "Next review", type: "date" },
      { key: "disposition_requested", label: "Disposition requested", type: "bool" },
    ] },
  rights_request: { kind: "rights_request", label: "Rights Requests", prefix: "DSR", statuses: opt("received", "verifying", "in_progress", "legal_review", "completed", "rejected"),
    note: "Erasure never deletes financial, tax, regulatory or legal records directly; conflicts go to privacy/legal review.",
    fields: [
      { key: "request_type", label: "Request type", type: "select", options: ["access", "correction", "erasure", "restriction", "objection", "portability"], required: true },
      { key: "identity_verified", label: "Identity verified", type: "bool" }, { key: "jurisdiction", label: "Jurisdiction" },
      { key: "received", label: "Received", type: "date", required: true }, { key: "due", label: "Due", type: "date" },
      { key: "owner", label: "Owner", type: "person" }, { key: "systems_searched", label: "Systems searched" },
      { key: "retention_obligations", label: "Exceptions / retention obligations", type: "long" },
      { key: "response", label: "Response", type: "long" }, { key: "completed", label: "Completed", type: "date" },
    ] },
  dpia: { kind: "dpia", label: "DPIAs", prefix: "DPIA", statuses: opt("draft", "in_review", "approved", "rejected"),
    note: "Supports the assessment; the software never concludes a DPIA is legally required or sufficient.",
    fields: [
      { key: "owner", label: "Owner", type: "person", required: true }, { key: "description", label: "Description", type: "long" },
      { key: "data", label: "Data categories" }, { key: "purpose", label: "Purpose" }, { key: "necessity", label: "Necessity/proportionality", type: "long" },
      { key: "subjects", label: "Data subjects" }, { key: "harms", label: "Potential harms", type: "long" },
      { key: "likelihood", label: "Likelihood", type: "select", options: ["Low", "Medium", "High"] }, { key: "severity", label: "Severity", type: "select", options: ["Low", "Medium", "High"] },
      { key: "mitigations", label: "Mitigations", type: "long" }, { key: "residual", label: "Residual risk", type: "select", options: ["Low", "Medium", "High"] },
      { key: "reviewer", label: "Reviewer", type: "person" }, { key: "approved_by", label: "Approved by", type: "person", humanOnly: true }, { key: "next_review", label: "Next review", type: "date" },
    ] },
  transfer: { kind: "transfer", label: "Transfers", prefix: "TR", statuses: opt("draft", "approved", "retired"),
    fields: [
      { key: "data", label: "Data categories" }, { key: "from", label: "From" }, { key: "to", label: "To (country/region)", required: true },
      { key: "recipient", label: "Recipient" }, { key: "mechanism", label: "Transfer mechanism/reference", humanOnly: true }, { key: "review_date", label: "Review date", type: "date" },
    ] },
  vendor: { kind: "vendor", label: "Vendors", prefix: "VN", statuses: opt("approved", "restricted", "terminated", "under_review"),
    note: "Links to the existing provider record. Never store credentials or secrets here.",
    fields: [
      { key: "provider_id", label: "Provider record" }, { key: "service", label: "Service", required: true }, { key: "system_owner", label: "System owner", type: "person" },
      { key: "data_accessed", label: "Data accessed" }, { key: "classification", label: "Classification", type: "select", options: CLASSIFICATIONS },
      { key: "processor_status", label: "Processor/subprocessor", type: "select", options: ["Processor", "Subprocessor", "Neither", "Undetermined"] },
      { key: "regions", label: "Countries/regions" }, { key: "dpa_status", label: "Agreement/DPA status", type: "select", options: ["Signed", "Pending", "Missing", "Not required"] },
      { key: "security_review", label: "Security review" }, { key: "soc_reference", label: "SOC report / certification reference" },
      { key: "review_date", label: "Review date", type: "date" }, { key: "next_review", label: "Next review", type: "date" },
      { key: "risk_rating", label: "Risk rating", type: "select", options: ["Low", "Medium", "High"] },
    ] },
  risk: { kind: "risk", label: "Risks", prefix: "RK", statuses: opt("open", "treating", "accepted", "closed"),
    note: "Risk acceptance must name the approving person; the software never accepts a risk.",
    fields: [
      { key: "asset", label: "Asset / process" }, { key: "threat", label: "Threat" },
      { key: "impact", label: "Impact", type: "select", options: ["Low", "Medium", "High"] }, { key: "likelihood", label: "Likelihood", type: "select", options: ["Low", "Medium", "High"] },
      { key: "inherent", label: "Inherent risk", type: "select", options: ["Low", "Medium", "High"] }, { key: "controls", label: "Controls" },
      { key: "residual", label: "Residual risk", type: "select", options: ["Low", "Medium", "High"] }, { key: "owner", label: "Owner", type: "person", required: true },
      { key: "treatment", label: "Treatment", type: "select", options: ["mitigate", "accept", "transfer", "avoid"] },
      { key: "accepted_by", label: "Acceptance approved by", type: "person", humanOnly: true },
      { key: "due", label: "Due date", type: "date" }, { key: "review_date", label: "Review date", type: "date" },
    ] },
  incident: { kind: "incident", label: "Incidents", prefix: "INC", statuses: opt("open", "contained", "investigating", "corrective_action", "closed"),
    note: "Whether regulators or customers must be notified is a human/legal/privacy decision — the software only records it.",
    fields: [
      { key: "discovered_at", label: "Discovered at", type: "date", required: true }, { key: "reported_by", label: "Reported by", type: "person" },
      { key: "systems", label: "Systems affected" }, { key: "data", label: "Data involved" },
      { key: "severity", label: "Severity", type: "select", options: ["Low", "Medium", "High", "Critical"] },
      { key: "containment", label: "Containment", type: "long" }, { key: "investigation", label: "Investigation", type: "long" },
      { key: "root_cause", label: "Root cause", type: "long" }, { key: "corrective_action", label: "Corrective action", type: "long" },
      { key: "assessment", label: "Privacy/security assessment", type: "long" },
      { key: "notification_decision", label: "Notification decision", type: "select", options: ["Pending human review", "Notify", "Do not notify"], humanOnly: true },
      { key: "decision_owner", label: "Decision owner", type: "person" }, { key: "closure", label: "Closure", type: "date" }, { key: "lessons", label: "Lessons learned", type: "long" },
    ] },
  exception: { kind: "exception", label: "Control exceptions", prefix: "EX", statuses: opt("open", "remediating", "retest", "closed"),
    note: "Closing an exception requires closure evidence.",
    fields: [
      { key: "control_key", label: "Failed control", required: true }, { key: "period", label: "Affected period" },
      { key: "issue", label: "Issue", type: "long", required: true }, { key: "impact", label: "Impact" },
      { key: "compensating", label: "Compensating control" }, { key: "owner", label: "Owner", type: "person" },
      { key: "remediation", label: "Remediation", type: "long" }, { key: "due", label: "Due date", type: "date" },
      { key: "retest", label: "Retest" }, { key: "closure_evidence_id", label: "Closure evidence ID" }, { key: "closed", label: "Closed date", type: "date" },
    ] },
  jml: { kind: "jml", label: "Joiner / Mover / Leaver", prefix: "JML", statuses: opt("open", "in_progress", "complete"),
    note: "Tracking only — no HR integration; access changes still happen in Access Control.",
    fields: [
      { key: "event", label: "Event", type: "select", options: ["joiner", "mover", "leaver"], required: true },
      { key: "person", label: "Person", type: "person", required: true },
      { key: "account_created", label: "Joiner: account created", type: "bool" }, { key: "role_approved", label: "Joiner: role approved", type: "bool" },
      { key: "scope_approved", label: "Joiner: scope approved", type: "bool" }, { key: "mfa_status", label: "MFA/identity status" },
      { key: "prior_reviewed", label: "Mover: prior access reviewed", type: "bool" }, { key: "old_removed", label: "Mover: old access removed", type: "bool" },
      { key: "new_assigned", label: "Mover: new access assigned", type: "bool" },
      { key: "suspended", label: "Leaver: account suspended", type: "bool" }, { key: "privileged_revoked", label: "Leaver: privileged roles revoked", type: "bool" },
      { key: "delegations_reviewed", label: "Leaver: delegations revoked/reviewed", type: "bool" }, { key: "services_reviewed", label: "Leaver: service access reviewed", type: "bool" },
    ] },
  privacy_review: { kind: "privacy_review", label: "Privacy-by-design reviews", prefix: "PBD", statuses: opt("open", "findings", "complete"),
    note: "Recorded for future product changes. Does not block deployment.",
    fields: [
      { key: "new_categories", label: "New personal-data categories introduced?", type: "long" }, { key: "necessary", label: "Is the new data necessary?", type: "long" },
      { key: "who_access", label: "Who needs access?" }, { key: "classification", label: "Classification", type: "select", options: CLASSIFICATIONS },
      { key: "retention", label: "Retention rule" }, { key: "vendor", label: "New vendor involved?" }, { key: "transfer", label: "International transfer?" },
      { key: "dpia", label: "DPIA review indicated? (human judgment)", type: "select", options: ["Not assessed", "Indicated", "Not indicated"], humanOnly: true },
      { key: "controls", label: "Applicable controls/evidence" }, { key: "findings", label: "Unresolved findings", type: "long" },
    ] },
};
export const PRIVACY_KINDS = ["data_map", "processing", "retention", "rights_request", "dpia", "transfer"];

/** Which permission a register needs (view / manage). */
export function registerPermissions(kind: string): { view: string; manage: string } {
  if (PRIVACY_KINDS.includes(kind) || kind === "privacy_review") return { view: "administration.privacy.view", manage: "administration.privacy.manage" };
  if (kind === "vendor") return { view: "administration.vendors.view", manage: "administration.vendors.manage" };
  if (kind === "risk") return { view: "administration.risks.view", manage: "administration.risks.manage" };
  if (kind === "incident") return { view: "administration.incidents.view", manage: "administration.incidents.manage" };
  if (kind === "jml") return { view: "administration.access_reviews.manage", manage: "administration.access_reviews.manage" };
  return { view: "administration.controls.view", manage: "administration.controls.edit" };
}

const SECRET_KEY = /(password|passwd|secret|api[_-]?key|token|credential|private[_-]?key)/i;
const SECRET_VALUE = /(sk_live_|sk_test_|AKIA[0-9A-Z]{12}|-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20}|xox[bp]-|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)/;
const TIN = /\b\d{3}-\d{2}-\d{4}\b|\b\d{2}-\d{7}\b/;

/** Validates a register entry. Returns the first problem or null. */
export function recordProblem(kind: string, status: string, data: Record<string, any> & { [k: string]: any }, ctx: { evidenceIds?: string[] | undefined } = {}): string | null {
  const spec = REGISTERS[kind];
  if (!spec) return "Unknown register.";
  if (!spec.statuses.includes(status)) return "Pick a valid status.";
  const allowed = new Set(spec.fields.map((f) => f.key));
  for (const [k, v] of Object.entries(data)) {
    if (!allowed.has(k)) return `Unexpected field "${k}".`;
    if (SECRET_KEY.test(k)) return "Credentials and secrets can't be stored here.";
    if (typeof v === "string" && SECRET_VALUE.test(v)) return "That looks like a credential or secret — don't store it here.";
    if (typeof v === "string" && TIN.test(v)) return "That looks like a tax ID — reference the audit record instead of copying it.";
  }
  for (const f of spec.fields) if (f.required && (data[f.key] === undefined || data[f.key] === "" || data[f.key] === null)) return `${f.label} is required.`;
  if (kind === "risk" && (status === "accepted" || data["treatment"] === "accept") && !data["accepted_by"]) return "Risk acceptance must name the approving person.";
  if (kind === "incident" && status === "closed" && (!data["notification_decision"] || data["notification_decision"] === "Pending human review" || !data["decision_owner"]))
    return "Record the human notification decision and its owner before closing.";
  if (kind === "exception" && status === "closed" && (!data["closure_evidence_id"] || (ctx.evidenceIds && !ctx.evidenceIds.includes(String(data["closure_evidence_id"])))))
    return "Closing an exception requires closure evidence.";
  if (kind === "processing" && status === "approved" && (!data["lawful_basis"] || !data["role"] || data["role"] === "Undetermined" || !data["approved_by"]))
    return "An authorized privacy/legal owner must set the basis and role and approve.";
  if (kind === "dpia" && status === "approved" && !data["approved_by"]) return "A DPIA needs a named human approver.";
  if (kind === "retention" && data["disposition_requested"] && data["hold"]) return "A legal/regulatory hold blocks disposition.";
  if (kind === "rights_request" && status === "completed" && !data["identity_verified"]) return "Verify identity before completing a request.";
  return null;
}

/** Rights requests never reach protected records; erasure routes to review. */
export const PROTECTED_RECORD_CATEGORIES = ["financial", "tax", "regulatory", "legal", "audit"];
export function rightsRequestAction(requestType: string, category: string): "route_to_privacy_legal_review" | "fulfil_by_human" {
  if (requestType === "erasure" && PROTECTED_RECORD_CATEGORIES.includes(category)) return "route_to_privacy_legal_review";
  return "fulfil_by_human";
}
export function dispositionProblem(entry: { hold?: boolean }): string | null {
  return entry.hold ? "A legal/regulatory hold blocks disposition." : null;
}

// ---------------------------------------------------------------- evidence snapshots (read-only computations)

export const EVIDENCE_QUERIES = {
  super_admins: { control: "AC-03", label: "Current Super Administrators" },
  staff_roles: { control: "AC-02", label: "Harmonious staff roles" },
  privileged_roles: { control: "AC-03", label: "Privileged roles" },
  privileged_accounts: { control: "AC-07", label: "Privileged accounts — individual assignment" },
  direct_grants: { control: "AC-02", label: "Direct grants" },
  explicit_denies: { control: "AC-02", label: "Explicit denies" },
  expired_access: { control: "AC-05", label: "Expired access" },
  suspended_users: { control: "AC-05", label: "Suspended users" },
  access_changes: { control: "LG-01", label: "Access changes (period)" },
  rejected_escalations: { control: "LG-01", label: "Rejected privilege escalations (period)" },
  scoped_fund: { control: "AC-06", label: "Scoped Fund access" },
  scoped_client: { control: "AC-06", label: "Scoped Client access" },
  sensitive_permissions: { control: "PR-01", label: "Sensitive permission assignments" },
  orphaned_access: { control: "AC-06", label: "Orphaned / unresolvable access" },
  needs_review: { control: "AC-06", label: "Access Control Needs Review items" },
} as const;
export type EvidenceQuery = keyof typeof EVIDENCE_QUERIES;
export const EVIDENCE_QUERY_VERSION = "rbac-evidence/1";

/** Stable JSON so fingerprints are reproducible. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as any)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

// ---------------------------------------------------------------- dashboard (facts only, never a "compliance score")

export type DashInput = {
  controls: { key: string; status: ControlStatus | null; nextDue: string | null }[];
  evidence: { reviewed: boolean; collected_at: string }[];
  reviews: { completed: boolean; period_end: string }[];
  records: { kind: string; status: string; data: Record<string, any> }[];
  today: string;
};
export function dashboard(i: DashInput) {
  const month = i.today.slice(0, 7);
  const r = (k: string) => i.records.filter((x) => x.kind === k);
  const over = (d?: string) => !!d && d < i.today;
  return {
    controls: { operating: i.controls.filter((c) => c.status === "operating" || c.status === "tested").length, overdue: i.controls.filter((c) => over(c.nextDue ?? undefined)).length, exceptions: i.controls.filter((c) => c.status === "exception" || c.status === "remediation").length },
    evidence: { dueThisMonth: i.controls.filter((c) => c.nextDue?.startsWith(month)).length, awaitingReview: i.evidence.filter((e) => !e.reviewed).length },
    accessReviews: { open: i.reviews.filter((x) => !x.completed).length, overdue: i.reviews.filter((x) => !x.completed && over(x.period_end)).length },
    privacy: { openRights: r("rights_request").filter((x) => !["completed", "rejected"].includes(x.status)).length, dpiasAwaiting: r("dpia").filter((x) => x.status === "in_review").length, retentionDue: r("retention").filter((x) => over(x.data["next_review"])).length },
    vendors: { reviewsDue: r("vendor").filter((x) => over(x.data["next_review"])).length, dpaMissing: r("vendor").filter((x) => !x.data["dpa_status"] || ["Missing", "Pending"].includes(x.data["dpa_status"])).length },
    risks: { highResidual: r("risk").filter((x) => x.data["residual"] === "High" && x.status !== "closed").length, overdue: r("risk").filter((x) => x.status !== "closed" && over(x.data["due"])).length },
    incidents: { open: r("incident").filter((x) => x.status !== "closed").length, correctiveOutstanding: r("incident").filter((x) => x.status === "corrective_action").length },
  };
}

/** Latest version per record_ref. */
export function latestVersions<T extends { record_ref: string; kind: string; version: number }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) { const k = `${r.kind}:${r.record_ref}`; const p = m.get(k); if (!p || r.version > p.version) m.set(k, r); }
  return [...m.values()];
}
