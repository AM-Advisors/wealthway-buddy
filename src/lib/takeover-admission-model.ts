/**
 * Existing-investor takeover admission (pure). Answers ONE question:
 * "Is this person/entity already an investor in the fund, established from the
 * prior administrator's source records?" It never says Harmonious performed KYC,
 * AML, accreditation, tax collection or payout verification - those are
 * separate statuses that create remediation and block only the actions they affect.
 */

export const INVESTOR_ORIGINS = [
  { value: "harmonious_onboarded", label: "Harmonious onboarded" },
  { value: "takeover_prior_administrator", label: "Takeover - prior administrator" },
  { value: "historical_import", label: "Historical import" },
  { value: "other_approved_migration", label: "Other approved migration" },
] as const;
export type InvestorOrigin = (typeof INVESTOR_ORIGINS)[number]["value"];
export type TakeoverOrigin = Exclude<InvestorOrigin, "harmonious_onboarded">;

export const ADMISSION_STATUSES = [
  { value: "prepared", label: "Prepared" },
  { value: "evidence_review", label: "Evidence review" },
  { value: "approval_required", label: "Approval required" },
  { value: "admitted", label: "Admitted" },
  { value: "rejected", label: "Rejected" },
  { value: "remediation_required", label: "Remediation required" },
  { value: "superseded", label: "Superseded" },
] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number]["value"];

export const EVIDENCE_REQUIREMENTS = [
  { key: "identity_name", label: "Investor identity / name", required: true },
  { key: "investor_type", label: "Investor / entity type", required: true },
  { key: "relationship", label: "Fund ownership / investor relationship", required: true },
  { key: "commitment", label: "Commitment", required: true },
  { key: "called", label: "Historical called capital", required: true },
  { key: "contributed", label: "Historical contributed capital", required: true },
  { key: "opening_capital", label: "Opening capital account", required: true },
  { key: "class", label: "Class", required: true },
  { key: "admission_closing", label: "Admission / closing evidence", required: false },
  { key: "source_as_of", label: "Source administrator and as-of date", required: true },
] as const;
export type EvidenceKey = (typeof EVIDENCE_REQUIREMENTS)[number]["key"];

export const EVIDENCE_STATUSES = [
  { value: "verified_from_source", label: "Verified from source" },
  { value: "review_required", label: "Evidence available - review required" },
  { value: "missing", label: "Missing" },
  { value: "not_applicable", label: "Not applicable" },
  { value: "pending_refresh", label: "Pending refresh" },
  { value: "superseded", label: "Superseded" },
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number]["value"];
export type EvidenceItem = { key: EvidenceKey; status: EvidenceStatus; sourceRef?: string | null; note?: string | null };

export const COMPLIANCE_ITEMS = [
  { key: "kyc", label: "KYC" },
  { key: "aml", label: "AML" },
  { key: "identity", label: "Identity verification" },
  { key: "accreditation", label: "Accreditation" },
  { key: "tax_document", label: "Tax document" },
  { key: "subscription_document", label: "Subscription document" },
  { key: "payout_destination", label: "Payout destination" },
] as const;
export type ComplianceKey = (typeof COMPLIANCE_ITEMS)[number]["key"];

export const COMPLIANCE_STATES = [
  { value: "prior_admin_verified", label: "Prior admin evidence verified" },
  { value: "refresh_required", label: "Harmonious refresh required" },
  { value: "refresh_complete", label: "Harmonious refresh complete" },
  { value: "missing", label: "Missing" },
  { value: "not_applicable", label: "Not applicable" },
  { value: "review_required", label: "Review required" },
  { value: "not_verified", label: "Not verified" },
] as const;
export type ComplianceState = (typeof COMPLIANCE_STATES)[number]["value"];
export type Compliance = Partial<Record<ComplianceKey, ComplianceState>> & { taxDocumentType?: string | null; taxReceivedOn?: string | null };

export type AdmissionInput = {
  investorName: string;
  investorType: string | null;
  classLabel: string | null;
  sourceSystem: string;
  asOfDate: string;
  relationshipEffectiveDate: string | null;
  commitmentCents: number;
  calledCents: number;
  contributedCents: number;
  openingCapitalCents: number;
  evidence: EvidenceItem[];
  compliance: Compliance;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Takeover admission can never verify a payout destination. */
export function normalizeCompliance(c: Compliance): Compliance {
  const out: Compliance = { ...c };
  for (const i of COMPLIANCE_ITEMS) if (!out[i.key]) out[i.key] = "missing";
  if (out.payout_destination !== "not_applicable") out.payout_destination = "not_verified";
  return out;
}

export function preparationErrors(i: AdmissionInput): string[] {
  const e: string[] = [];
  if (!i.investorName.trim()) e.push("Investor name is required.");
  if (!i.sourceSystem.trim()) e.push("Name the prior administrator or source system.");
  if (!DATE.test(i.asOfDate)) e.push("A source as-of date is required.");
  if (i.relationshipEffectiveDate && !DATE.test(i.relationshipEffectiveDate)) e.push("Relationship date must be a date.");
  if (i.relationshipEffectiveDate && i.relationshipEffectiveDate > i.asOfDate) e.push("The relationship cannot start after the source as-of date.");
  if (i.commitmentCents <= 0) e.push("Commitment must be positive.");
  if (i.calledCents > i.commitmentCents) e.push("Historical called exceeds commitment.");
  if (i.contributedCents > i.calledCents) e.push("Historical contributed exceeds called.");
  for (const r of EVIDENCE_REQUIREMENTS) if (!i.evidence.some((x) => x.key === r.key)) e.push(`Evidence status needed: ${r.label}.`);
  return e;
}

/** Which required evidence still blocks approval (missing or unreviewed). */
export function evidenceBlockers(evidence: EvidenceItem[]): string[] {
  return EVIDENCE_REQUIREMENTS.filter((r) => r.required)
    .filter((r) => {
      const s = evidence.find((x) => x.key === r.key)?.status;
      return !s || s === "missing" || s === "review_required" || s === "superseded";
    })
    .map((r) => r.label);
}

export function statusAfterPreparation(evidence: EvidenceItem[]): AdmissionStatus {
  return evidenceBlockers(evidence).length ? "evidence_review" : "approval_required";
}

/** Separation of duties: a different person must decide. */
export function decisionError(a: { status: AdmissionStatus; preparedBy: string; evidence: EvidenceItem[] }, decider: string, approve: boolean, reason: string | null): string | null {
  if (a.preparedBy === decider) return "A takeover admission must be decided by someone other than its preparer.";
  if (approve && a.status !== "approval_required") return "Only an admission awaiting approval can be admitted.";
  if (!approve && !["prepared", "evidence_review", "approval_required"].includes(a.status)) return "This admission has already been decided.";
  if (approve && evidenceBlockers(a.evidence).length) return `Evidence still blocks approval: ${evidenceBlockers(a.evidence).join(", ")}.`;
  if (!approve && (reason ?? "").trim().length < 10) return "Give a reason (at least 10 characters) for rejecting.";
  return null;
}

/** Records must agree with the admission; any difference is an ownership discrepancy, never silently fixed. */
export function economicDiscrepancies(a: { commitmentCents: number; calledCents: number; contributedCents: number }, recorded: { commitmentCents: number; calledCents: number; contributedCents: number }): string[] {
  const out: string[] = [];
  if (a.commitmentCents !== recorded.commitmentCents) out.push(`Commitment: source ${a.commitmentCents} vs records ${recorded.commitmentCents} cents.`);
  if (a.calledCents !== recorded.calledCents) out.push(`Called: source ${a.calledCents} vs records ${recorded.calledCents} cents.`);
  if (a.contributedCents !== recorded.contributedCents) out.push(`Contributed: source ${a.contributedCents} vs records ${recorded.contributedCents} cents.`);
  return out;
}

export type Remediation = { key: string; label: string; blocks: string[] };

/** Genuinely missing/current items become remediation tasks. They never change economics. */
export function remediationFor(c: Compliance, evidence: EvidenceItem[]): Remediation[] {
  const n = normalizeCompliance(c);
  const r: Remediation[] = [];
  const needs = (k: ComplianceKey) => ["missing", "refresh_required", "review_required"].includes(String(n[k]));
  if (needs("tax_document")) r.push({ key: "tax_document", label: n.taxDocumentType ? `Obtain current ${n.taxDocumentType}` : "Obtain current W-9 / W-8", blocks: ["distribution", "tax_reporting"] });
  if (needs("kyc") || needs("identity")) r.push({ key: "kyc_refresh", label: "Complete KYC / identity refresh", blocks: ["new_subscription"] });
  if (needs("aml")) r.push({ key: "aml_review", label: "Complete AML screening", blocks: ["accept_funds", "distribution"] });
  if (needs("accreditation")) r.push({ key: "accreditation_refresh", label: "Refresh accreditation", blocks: ["new_subscription"] });
  if (needs("subscription_document")) r.push({ key: "subscription_document", label: "Obtain missing subscription agreement", blocks: [] });
  if (n.payout_destination === "not_verified") r.push({ key: "payout_destination", label: "Verify payout destination", blocks: ["payout"] });
  if (evidence.find((e) => e.key === "admission_closing")?.status === "missing") r.push({ key: "closing_evidence", label: "Locate admission / closing evidence", blocks: [] });
  return r;
}

export type EligibilityRow = {
  positionId: string;
  name: string;
  origin: InvestorOrigin;
  positionStatus: string;
  admissionStatus: AdmissionStatus | "harmonious_onboarding" | "none";
  commitmentCents: number;
  calledCents: number;
  contributedCents: number;
  remainingCents: number;
  flags: string[];
  eligible: boolean;
  reason: string;
};

/**
 * Capital call eligibility: a valid investor relationship plus remaining commitment.
 * Compliance refresh items are flags here; they block only the actions they name
 * (e.g. AML blocks accepting funds, payout destination blocks payouts).
 */
export function capitalCallEligibility(p: Omit<EligibilityRow, "eligible" | "reason" | "remainingCents">): EligibilityRow {
  const remainingCents = Math.max(0, p.commitmentCents - p.calledCents);
  const base = { ...p, remainingCents };
  if (p.origin !== "harmonious_onboarded" && p.admissionStatus !== "admitted") return { ...base, eligible: false, reason: "Takeover admission not approved yet." };
  if (p.positionStatus !== "active") return { ...base, eligible: false, reason: p.origin === "harmonious_onboarded" ? "Onboarding not closed yet." : "Investor relationship is not active." };
  if (remainingCents <= 0) return { ...base, eligible: false, reason: "No remaining commitment." };
  return { ...base, eligible: true, reason: p.flags.length ? "Eligible; open items block only their own actions." : "Eligible." };
}

export function batchReconciliation(rows: { commitmentCents: number; calledCents: number; contributedCents: number; openingCapitalCents: number }[], expected: { count: number; commitmentCents: number; calledCents: number; contributedCents: number; openingCapitalCents: number }) {
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + r[k], 0);
  const actual = { count: rows.length, commitmentCents: sum("commitmentCents"), calledCents: sum("calledCents"), contributedCents: sum("contributedCents"), openingCapitalCents: sum("openingCapitalCents") };
  const checks = (Object.keys(expected) as (keyof typeof expected)[]).map((k) => ({ key: k, expected: expected[k], actual: actual[k], ok: expected[k] === actual[k] }));
  return { actual, checks, ok: checks.every((c) => c.ok) };
}
