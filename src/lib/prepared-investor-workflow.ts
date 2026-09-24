/**
 * Prepared investor → onboarding → documents. Pure rules only; every input
 * comes from authoritative records evaluated on the server. Nothing here
 * approves compliance, signs, or funds anything.
 */
import type { RequirementKey } from "@/lib/investor-onboarding-model";
import {
  FORBIDDEN_PREP_KEYS, type FundDocument, type PreparedField, type PreparerCapacity, type SelectedDoc,
  reconcileDocuments, signingModeOf,
} from "@/lib/investor-prep-model";

/* ---------- 1–3. Confirm Your Information ---------- */

export type ReviewGroup = "profile" | "contact" | "investment" | "entity" | "related";
export const REVIEW_GROUP_LABELS: Record<ReviewGroup, string> = {
  profile: "You / Investing Profile", contact: "Contact Information", investment: "Investment",
  entity: "Entity / Trust / Retirement Account", related: "Related People",
};
export const FIELD_GROUP: Record<string, ReviewGroup> = {
  legal_name: "profile", display_name: "profile", profile_type: "profile", tax_classification: "profile", country: "profile",
  email: "contact", phone: "contact", address: "contact",
  commitment_cents: "investment", expected_funding_cents: "investment",
  entity_name: "entity", ownership_title: "entity", authorized_signer_name: "entity", signer_title: "entity", control_person: "entity",
};
export const FIELD_LABELS: Record<string, string> = {
  legal_name: "Legal name", display_name: "Name", profile_type: "Investing as", tax_classification: "Tax classification",
  country: "Country of residence", email: "Email", phone: "Phone", address: "Address",
  commitment_cents: "Commitment amount", expected_funding_cents: "Expected funding",
  entity_name: "Entity legal name", ownership_title: "Ownership title", authorized_signer_name: "Authorized signer",
  signer_title: "Signer title / capacity", control_person: "Control person",
};
/** Manager/internal-only keys never shown to the investor. */
export const INTERNAL_ONLY_KEYS = ["external_reference", "side_letter"] as const;
/** Fields the investor is allowed to confirm or correct. */
export const CONFIRMABLE_KEYS = Object.keys(FIELD_GROUP);

export type FieldProvenance = {
  key: string;
  preparedValue: unknown;
  currentValue: unknown;
  preparedBy: PreparerCapacity;
  preparedAt: string;
  status: "prepared" | "investor_confirmed" | "investor_corrected";
  reviewedAt: string | null;
  history: { at: string; from: unknown; to: unknown }[];
};

export function initialProvenance(fields: Record<string, PreparedField>, preparedAt: string): Record<string, FieldProvenance> {
  const out: Record<string, FieldProvenance> = {};
  for (const [k, f] of Object.entries(fields)) {
    if (!CONFIRMABLE_KEYS.includes(k)) continue;
    out[k] = {
      key: k, preparedValue: f.value, currentValue: f.value, preparedBy: f.source === "investor" ? "fund_manager" : f.source,
      preparedAt, status: "prepared", reviewedAt: null, history: [],
    };
  }
  return out;
}

export function assertConfirmable(key: string): { ok: true } | { ok: false; error: string } {
  if ((FORBIDDEN_PREP_KEYS as readonly string[]).includes(key)) {
    return { ok: false, error: "That item is completed through its own verification step, not here." };
  }
  if (!CONFIRMABLE_KEYS.includes(key)) return { ok: false, error: "That information can't be confirmed here." };
  return { ok: true };
}

/** Confirm keeps the value; Correct records old → new. Preparer attribution is never erased. */
export function reviewField(
  current: FieldProvenance, action: { confirm: true } | { correct: unknown }, at: string,
): FieldProvenance {
  if ("confirm" in action) return { ...current, status: current.status === "investor_corrected" ? current.status : "investor_confirmed", reviewedAt: at };
  if (JSON.stringify(current.currentValue) === JSON.stringify(action.correct)) {
    return { ...current, status: current.status === "investor_corrected" ? current.status : "investor_confirmed", reviewedAt: at };
  }
  return {
    ...current, currentValue: action.correct, status: "investor_corrected", reviewedAt: at,
    history: [...current.history, { at, from: current.currentValue, to: action.correct }],
  };
}

export type InvestorFieldView = { key: string; label: string; group: ReviewGroup; value: unknown; reviewed: boolean };

/** Investor view: plain values only, no audit terminology, no internal keys. */
export function investorReviewView(prov: Record<string, FieldProvenance>, profileType: string): { group: ReviewGroup; label: string; fields: InvestorFieldView[] }[] {
  const entityApplies = !["unknown", "individual", "joint"].includes(profileType);
  const groups = new Map<ReviewGroup, InvestorFieldView[]>();
  for (const p of Object.values(prov)) {
    const g = FIELD_GROUP[p.key];
    if (!g || (g === "entity" && !entityApplies)) continue;
    const list = groups.get(g) ?? [];
    list.push({ key: p.key, label: FIELD_LABELS[p.key] ?? p.key, group: g, value: p.currentValue, reviewed: p.status !== "prepared" });
    groups.set(g, list);
  }
  const order: ReviewGroup[] = ["profile", "contact", "investment", "entity", "related"];
  return order.filter((g) => groups.get(g)?.length).map((g) => ({ group: g, label: REVIEW_GROUP_LABELS[g], fields: groups.get(g)! }));
}

export function allReviewed(prov: Record<string, FieldProvenance>): boolean {
  return Object.values(prov).every((p) => p.status !== "prepared");
}

/* ---------- 4–7. Material change → affected requirements ---------- */

/** Which requirements depend on each fact. Anything not listed is non-material. */
export const FIELD_REQUIREMENT_DEPENDENCIES: Record<string, RequirementKey[]> = {
  profile_type: ["investment_profile", "identity_verification", "entity_verification", "beneficial_owners", "tax_classification", "tax_documentation", "accreditation", "eligibility", "subscription_documents", "signature"],
  legal_name: ["identity_verification", "aml", "tax_documentation", "subscription_documents", "signature"],
  entity_name: ["entity_verification", "aml", "tax_documentation", "subscription_documents", "signature"],
  tax_classification: ["tax_classification", "tax_documentation"],
  country: ["aml", "tax_classification", "tax_documentation", "eligibility"],
  commitment_cents: ["investment_amount", "accreditation", "subscription_documents"],
  authorized_signer_name: ["beneficial_owners", "subscription_documents", "signature"],
  signer_title: ["subscription_documents", "signature"],
  control_person: ["beneficial_owners", "identity_verification", "aml"],
  related_people: ["beneficial_owners", "identity_verification", "aml"],
};

export function isMaterial(key: string): boolean {
  return key in FIELD_REQUIREMENT_DEPENDENCIES;
}

/** Only the requirements whose facts changed are reopened. */
export function affectedRequirements(changedKeys: string[]): RequirementKey[] {
  const s = new Set<RequirementKey>();
  for (const k of changedKeys) for (const r of FIELD_REQUIREMENT_DEPENDENCIES[k] ?? []) s.add(r);
  return [...s];
}

/** Engine results before vs after → what the investor must now do (shown as one concise message). */
export function requirementDelta(
  before: { key: RequirementKey; state: string }[], after: { key: RequirementKey; state: string }[],
): { added: RequirementKey[]; reopened: RequirementKey[]; firstAffected: RequirementKey | null } {
  const b = new Map(before.map((r) => [r.key, r.state]));
  const added: RequirementKey[] = []; const reopened: RequirementKey[] = [];
  for (const r of after) {
    const prev = b.get(r.key);
    const open = r.state === "missing" || r.state === "refresh_required";
    if (!open) continue;
    if (prev === undefined || prev === "not_applicable") added.push(r.key);
    else if (prev === "valid") reopened.push(r.key);
  }
  return { added, reopened, firstAffected: added[0] ?? reopened[0] ?? null };
}

/** Documents recompute from the fund's own configuration; required ones stay required. */
export function recalcAgreements(
  offeringId: string, docs: (FundDocument & { applies_to?: string[] | null })[], current: SelectedDoc[], profileType: string,
) {
  const applicable = docs.filter((d) => !d.applies_to || d.applies_to.length === 0 || d.applies_to.includes(profileType));
  const ids = new Set(applicable.map((d) => d.id));
  const keep = current.filter((s) => ids.has(s.documentId));
  const autoSpecific = applicable
    .filter((d) => d.applies_to?.includes(profileType) && !d.investor_required)
    .map((d) => ({ documentId: d.id, requirement: "investor_specific" as const }));
  return reconcileDocuments(offeringId, applicable.map((d) => ({ ...d, investor_required: d.investor_required && (!d.applies_to?.length || d.applies_to.includes(profileType)) })), [...keep, ...autoSpecific]);
}

/* ---------- 8–10. Merge engine ---------- */

export type MergeSource = "investment_profile" | "investment" | "fund" | "system";
export type MergeInput = {
  profile: Record<string, unknown>;          // investor-confirmed profile values
  investment: { commitment_cents?: number | null };
  fund: { name: string; legal_entity_name?: string | null };
  effectiveDate: string;
};
const MERGE_MAP: Record<string, { source: MergeSource; key: string; label: string }> = {
  investor_legal_name: { source: "investment_profile", key: "legal_name", label: "Investor legal name" },
  entity_legal_name: { source: "investment_profile", key: "entity_name", label: "Entity legal name" },
  address: { source: "investment_profile", key: "address", label: "Address" },
  email: { source: "investment_profile", key: "email", label: "Email" },
  investment_profile: { source: "investment_profile", key: "profile_type", label: "Investing as" },
  signer_name: { source: "investment_profile", key: "authorized_signer_name", label: "Authorized signer name" },
  signer_title: { source: "investment_profile", key: "signer_title", label: "Authorized signer title" },
  commitment_amount: { source: "investment", key: "commitment_cents", label: "Investment amount" },
  fund_name: { source: "fund", key: "name", label: "Fund name" },
  fund_legal_entity: { source: "fund", key: "legal_entity_name", label: "Fund legal entity" },
  effective_date: { source: "system", key: "effectiveDate", label: "Date" },
};
export const SUPPORTED_MERGE_FIELDS = Object.keys(MERGE_MAP);

export function requiredMergeFields(profileType: string, signingMode: string): string[] {
  const entity = !["unknown", "individual", "joint"].includes(profileType);
  const base = ["investor_legal_name", "commitment_amount", "fund_name", "effective_date"];
  if (entity) base.push("entity_legal_name", "signer_name", "signer_title");
  if (signingMode === "investor_then_manager") base.push("fund_legal_entity");
  return base;
}

/** Produces values + provenance. Returns a copy — the profile is never mutated by a document. */
export function mergeDocument(input: MergeInput, required: string[]): {
  values: Record<string, string>; sources: Record<string, MergeSource>; missing: { field: string; message: string; profileKey: string }[];
} {
  const values: Record<string, string> = {}; const sources: Record<string, MergeSource> = {};
  for (const [field, m] of Object.entries(MERGE_MAP)) {
    let raw: unknown;
    if (m.source === "investment_profile") raw = input.profile[m.key];
    else if (m.source === "investment") raw = (input.investment as any)[m.key];
    else if (m.source === "fund") raw = (input.fund as any)[m.key];
    else raw = input.effectiveDate;
    let v = raw == null ? "" : String(raw).trim();
    if (field === "commitment_amount" && v) {
      const c = Number(v); v = c > 0 ? `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "";
    }
    values[field] = v; sources[field] = m.source;
  }
  const missing = required.filter((f) => !values[f]).map((f) => ({
    field: f, message: `${MERGE_MAP[f]?.label ?? f} is required.`, profileKey: MERGE_MAP[f]?.key ?? f,
  }));
  return { values, sources, missing };
}

/* ---------- 11–13. Snapshot, staleness, review, signing ---------- */

export function fingerprint(obj: unknown): string {
  const s = JSON.stringify(obj, Object.keys(obj as object).sort());
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

export type DocSnapshot = {
  version: number; documentId: string; templateRef: string; profileFingerprint: string;
  mergeValues: Record<string, string>; signingMode: string;
  status: "prepared" | "reviewed" | "sent_for_signature" | "stale" | "superseded";
  reviewedAt: string | null;
};

export function isStale(snap: DocSnapshot, currentMergeValues: Record<string, string>): boolean {
  return fingerprint(snap.mergeValues) !== fingerprint(currentMergeValues);
}

/** Regeneration supersedes the prior version but keeps it in history. */
export function regenerate(history: DocSnapshot[], next: Omit<DocSnapshot, "version" | "status" | "reviewedAt">): DocSnapshot[] {
  const version = history.reduce((m, s) => Math.max(m, s.version), 0) + 1;
  return [
    ...history.map((s) => (s.status === "superseded" || s.status === "sent_for_signature" ? s : { ...s, status: "superseded" as const })),
    { ...next, version, status: "prepared", reviewedAt: null },
  ];
}

export function signingHandoffBlocker(
  snap: DocSnapshot | null, currentMergeValues: Record<string, string>, missing: { message: string }[],
): string | null {
  if (missing.length) return "Document needs information";
  if (!snap) return "Document hasn't been prepared yet";
  if (snap.status === "superseded" || isStale(snap, currentMergeValues)) return "Document needs to be regenerated";
  if (snap.status !== "reviewed") return "Please review the document before continuing to sign";
  return null;
}

export function signatureConfig(d: FundDocument) {
  const mode = signingModeOf(d);
  return { mode, signers: mode === "investor_then_manager" ? ["investor", "fund_manager"] : mode === "investor_only" ? ["investor"] : [] };
}

/* ---------- 14–16. Manager list and Next Action ---------- */

export type ManagerRowInput = {
  invitedOnly?: boolean; draftOnly?: boolean;
  kycStatus?: string | null; amlStatus?: string | null; accreditationStatus?: string | null;
  documentsStatus?: string | null; fundingStatus?: string | null; stage?: string | null;
  needsInvestorInfo?: boolean; harmoniousReview?: boolean;
  investorSigned?: boolean; managerSignatureRequired?: boolean; fullyExecuted?: boolean;
  approvedToFund?: boolean;
};

export type NextAction =
  | "Send onboarding" | "Waiting for investor" | "Investor needs information" | "Harmonious review"
  | "Investor signature required" | "Your signature required" | "Approved to fund" | "Waiting for funding" | "Complete";

export function nextAction(r: ManagerRowInput): NextAction {
  if (r.draftOnly) return "Send onboarding";
  if (r.fundingStatus === "funded") return "Complete";
  if (r.invitedOnly) return "Waiting for investor";
  if (r.approvedToFund) return ["bank_transaction_detected", "reconciliation_pending", "partially_funded", "awaiting_wire"].includes(String(r.fundingStatus)) ? "Waiting for funding" : "Approved to fund";
  if (r.needsInvestorInfo) return "Investor needs information";
  if (r.investorSigned && r.managerSignatureRequired && !r.fullyExecuted) return "Your signature required";
  if (r.harmoniousReview || r.stage === "harmonious_review") return "Harmonious review";
  const verified = r.kycStatus === "approved" && r.amlStatus === "approved";
  if (verified && r.accreditationStatus === "approved" && !r.investorSigned) return "Investor signature required";
  return "Waiting for investor";
}

const coarse = (s?: string | null) =>
  s === "approved" ? "Complete" : s === "rejected" || s === "needs_info" || s === "refresh_required" ? "Needs information" : s === "in_review" || s === "pending_review" ? "Compliance review" : "Not started";

/** Coarse statuses only — never evidence, TINs, raw provider or screening results. */
export function managerSafeRow(r: ManagerRowInput & { name: string; investingAs: string; commitmentCents: number }) {
  return {
    investor: r.name, investingAs: r.investingAs, commitmentCents: r.commitmentCents,
    verification: r.kycStatus === "approved" && r.amlStatus === "approved" ? "Complete" : coarse(r.kycStatus === "approved" ? r.amlStatus : r.kycStatus),
    accreditation: coarse(r.accreditationStatus),
    documents: r.fullyExecuted ? "Fully executed" : r.investorSigned ? (r.managerSignatureRequired ? "Awaiting Fund Manager" : "Investor signed") : coarse(r.documentsStatus),
    funding: r.fundingStatus === "funded" ? "Funded" : r.approvedToFund ? "Approved to fund" : "Not yet",
    nextAction: nextAction(r),
  };
}

/* ---------- 17–19. Action Center (derived + idempotent) ---------- */

export type Persona = "investor" | "fund_manager" | "harmonious";
export type DerivedAction = { key: string; persona: Persona; title: string; href: string; fundId: string; subjectId: string };

export type ActionFacts = {
  fundId: string; fundName: string;
  drafts?: { id: string; name: string; canSend: boolean }[];
  myInvestments?: { onboardingId: string; unreviewedPrepared: boolean; needsInfo: boolean; identityPending: boolean; docsToReview: boolean; docsToSign: boolean; approvedToFund: boolean }[];
  countersign?: { onboardingId: string; investorName: string; documentTitle: string; iAmSignatory: boolean }[];
  opsReview?: { onboardingId: string; category: "Needs Harmonious Review" | "Tax Classification Review" | "Compliance Review" | "Missing Fund Setup" | "Document Preparation Issue" | "Eligibility Review"; allowed: boolean }[];
};

/** An action exists only while its condition is true; the key is stable so re-processing never duplicates. */
export function deriveActions(f: ActionFacts): DerivedAction[] {
  const out: DerivedAction[] = [];
  const push = (a: DerivedAction) => { if (!out.some((x) => x.key === a.key)) out.push(a); };
  for (const d of f.drafts ?? []) if (d.canSend) push({ key: `draft_ready:${d.id}`, persona: "fund_manager", title: `Investor draft ready to send — ${d.name}`, href: `/manager/funds/${f.fundId}?tab=investors&draft=${d.id}`, fundId: f.fundId, subjectId: d.id });
  for (const i of f.myInvestments ?? []) {
    const base = `/onboard/i/${i.onboardingId}`;
    if (i.unreviewedPrepared) push({ key: `confirm_info:${i.onboardingId}`, persona: "investor", title: `Confirm your investment information — ${f.fundName}`, href: `${base}#confirm`, fundId: f.fundId, subjectId: i.onboardingId });
    if (i.needsInfo) push({ key: `needs_info:${i.onboardingId}`, persona: "investor", title: "Additional information required", href: `${base}#requirements`, fundId: f.fundId, subjectId: i.onboardingId });
    if (i.identityPending) push({ key: `identity:${i.onboardingId}`, persona: "investor", title: "Complete identity verification", href: `${base}#verification`, fundId: f.fundId, subjectId: i.onboardingId });
    if (i.docsToReview) push({ key: `review_docs:${i.onboardingId}`, persona: "investor", title: "Review your documents", href: `${base}#documents`, fundId: f.fundId, subjectId: i.onboardingId });
    if (i.docsToSign) push({ key: `sign_docs:${i.onboardingId}`, persona: "investor", title: "Sign investment documents", href: `${base}#documents`, fundId: f.fundId, subjectId: i.onboardingId });
    if (i.approvedToFund) push({ key: `approved_fund:${i.onboardingId}`, persona: "investor", title: `Approved to fund — ${f.fundName}`, href: `/investment/${i.onboardingId}?step=fund`, fundId: f.fundId, subjectId: i.onboardingId });
  }
  for (const c of f.countersign ?? []) if (c.iAmSignatory) push({ key: `countersign:${c.onboardingId}:${c.documentTitle}`, persona: "fund_manager", title: `Countersign ${c.investorName}'s ${c.documentTitle}`, href: `/manager/funds/${f.fundId}?tab=investors&onboarding=${c.onboardingId}`, fundId: f.fundId, subjectId: c.onboardingId });
  for (const o of f.opsReview ?? []) if (o.allowed) push({ key: `ops:${o.category}:${o.onboardingId}`, persona: "harmonious", title: `${o.category}`, href: `/admin/investor-onboarding?onboarding=${o.onboardingId}`, fundId: f.fundId, subjectId: o.onboardingId });
  return out;
}

/** Idempotent reconcile against stored items: create missing, resolve those whose condition ended. */
export function reconcileActions(existingOpenKeys: string[], derived: DerivedAction[]) {
  const want = new Set(derived.map((d) => d.key));
  const have = new Set(existingOpenKeys);
  return { create: derived.filter((d) => !have.has(d.key)), resolve: existingOpenKeys.filter((k) => !want.has(k)) };
}

/** Adapts a manager application row to coarse, manager-safe statuses. */
export function managerRowFromApplication(row: any) {
  return managerSafeRow({
    name: row.name, investingAs: row.accountLabel, commitmentCents: row.commitmentCents ?? 0,
    kycStatus: row.kycStatus, amlStatus: row.amlStatus, accreditationStatus: row.accreditationStatus,
    documentsStatus: row.documentsStatus, fundingStatus: row.fundingStatus, stage: row.stage,
    investorSigned: (row.signedCount ?? 0) > 0, fullyExecuted: row.documentsStatus === "approved",
    managerSignatureRequired: false, approvedToFund: row.stage === "funding",
    harmoniousReview: row.managerReviewStatus === "in_review",
  });
}

/* ---------- Final integration: authoritative facts, applicability, gates ---------- */

/** Investor-confirmed/corrected values win over prepared values. Unreviewed prepared values never drive requirements. */
export function confirmedFacts(prov: Record<string, FieldProvenance>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of Object.values(prov)) if (p.status !== "prepared") out[p.key] = p.currentValue;
  return out;
}

/** Overlay confirmed facts onto the stored facts used by the requirements engine. Provider/tax records stay authoritative. */
export function effectiveResolverFacts(
  stored: { profileType: string | null; requestedAmountCents: number | null; country: string | null },
  confirmed: Record<string, unknown>,
) {
  const s = (k: string) => (typeof confirmed[k] === "string" && confirmed[k] ? String(confirmed[k]) : null);
  const n = Number(confirmed["commitment_cents"]);
  return {
    profileType: s("profile_type") ?? stored.profileType,
    requestedAmountCents: Number.isFinite(n) && n > 0 ? n : stored.requestedAmountCents,
    country: s("country") ?? stored.country,
  };
}

/** Empty applies_to = All Investors. */
export function docApplies(appliesTo: string[] | null | undefined, profileType: string | null | undefined): boolean {
  if (!appliesTo || appliesTo.length === 0) return true;
  return !!profileType && appliesTo.includes(profileType);
}

export const APPLIES_TO_OPTIONS = [
  ["individual", "Individual"], ["joint", "Joint"], ["llc", "LLC"], ["corporation", "Corporation"],
  ["partnership", "Partnership"], ["trust", "Trust"], ["ira", "IRA / SDIRA"], ["retirement_plan", "Retirement plan"],
] as const;

export type SnapshotRow = {
  id: string; onboarding_id: string; offering_id: string; document_id: string; version: number;
  status: string; merge_values: Record<string, string>; reviewed_by: string | null; reviewed_fingerprint: string | null;
};

export const SIGNING_UNAVAILABLE = "Signing unavailable — this document needs to be reviewed again.";

/**
 * Server-side gate before any Box session is created. Never trusts a browser flag:
 * only the stored snapshot, its review record and freshly computed merge values count.
 */
export function signingGate(input: {
  investorUserId: string; onboardingId: string; offeringId: string; documentId: string;
  latest: SnapshotRow | null; currentMergeValues: Record<string, string>; missing: { message: string }[];
  templateReady: boolean; signerConfigReady: boolean; prerequisitesMet: boolean;
}): { ok: true; snapshotId: string; version: number } | { ok: false; error: string; next: "complete_information" | "review_document" | "regenerate" | "wait" } {
  const s = input.latest;
  if (input.missing.length) return { ok: false, error: `${SIGNING_UNAVAILABLE} ${input.missing.map((m) => m.message).join(" ")}`, next: "complete_information" };
  if (!input.templateReady || !input.signerConfigReady) return { ok: false, error: "Signing unavailable — this document isn't prepared for signature yet.", next: "wait" };
  if (!input.prerequisitesMet) return { ok: false, error: "Signing unavailable — finish the earlier steps first.", next: "wait" };
  if (!s || s.onboarding_id !== input.onboardingId || s.offering_id !== input.offeringId || s.document_id !== input.documentId) return { ok: false, error: SIGNING_UNAVAILABLE, next: "review_document" };
  if (["stale", "superseded"].includes(s.status)) return { ok: false, error: SIGNING_UNAVAILABLE, next: "regenerate" };
  if (fingerprint(s.merge_values) !== fingerprint(input.currentMergeValues)) return { ok: false, error: SIGNING_UNAVAILABLE, next: "regenerate" };
  const reviewed = (s.status === "reviewed" || s.status === "sent_for_signature") && s.reviewed_by === input.investorUserId && s.reviewed_fingerprint === fingerprint(s.merge_values);
  if (!reviewed) return { ok: false, error: SIGNING_UNAVAILABLE, next: "review_document" };
  return { ok: true, snapshotId: s.id, version: s.version };
}

/** A Box completion counts only for the current snapshot version. */
export function completionSatisfiesCurrent(sig: { snapshot_id?: string | null } | null, currentSnapshotId: string | null): boolean {
  if (!sig) return false;
  if (!currentSnapshotId) return !sig.snapshot_id; // legacy documents with no generated version
  return sig.snapshot_id === currentSnapshotId;
}

export type CountersignState = "investor_not_signed" | "your_signature_required" | "awaiting_fund_manager" | "fully_executed" | "not_dual";

/** Only the exact configured signatory who is still a manager of that fund gets "Your signature required". */
export function countersignState(input: {
  mode: string; providerStatus: string | null; investorSigned: boolean; managerSigned: boolean;
  countersignerUserId: string | null; viewerUserId: string; viewerManagesFund: boolean;
}): CountersignState {
  if (input.mode !== "dual") return "not_dual";
  if (String(input.providerStatus).toLowerCase() === "completed" && input.investorSigned && input.managerSigned) return "fully_executed";
  if (!input.investorSigned) return "investor_not_signed";
  if (input.countersignerUserId && input.countersignerUserId === input.viewerUserId && input.viewerManagesFund && !input.managerSigned) return "your_signature_required";
  return "awaiting_fund_manager";
}

/** Access is re-checked when an action is opened, not only when it was generated. */
export function actionAccessible(a: DerivedAction, access: { ownOnboardings: string[]; managedFunds: string[]; staff: boolean }): boolean {
  if (a.persona === "investor") return access.ownOnboardings.includes(a.subjectId);
  if (a.persona === "fund_manager") return access.managedFunds.includes(a.fundId);
  return access.staff;
}

const SENSITIVE_WORDS = /\b(ssn|tin|passport|sanction|ofac|pep|w-?9|w-?8|bad actor|didit|id image)\b/i;
export function titleIsSafe(title: string): boolean { return !SENSITIVE_WORDS.test(title); }
