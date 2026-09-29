/**
 * Offering Documents — pure rules (no I/O).
 *
 * The uploaded file is the authoritative document; Harmonious only manages its
 * type, version, approval, usage, applicability and signing configuration.
 * Execution belongs to each Investment, never to the Offering-level source file.
 */

export const DOCUMENT_CATEGORIES = ["operating_agreement", "subscription_agreement", "ppm", "other"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  operating_agreement: "Operating Agreement",
  subscription_agreement: "Subscription Agreement",
  ppm: "Private Placement Memorandum (PPM)",
  other: "Other Offering Document",
};

export const DOCUMENT_USAGES = ["reference", "acknowledgment", "signature"] as const;
export type DocumentUsage = (typeof DOCUMENT_USAGES)[number];
export const DOCUMENT_USAGE_LABELS: Record<DocumentUsage, string> = {
  reference: "Reference Only",
  acknowledgment: "Acknowledgment Required",
  signature: "Signature Required",
};

export const SIGNER_ROLES = [
  "investor",
  "joint_investor",
  "entity_authorized_signer",
  "trustee",
  "fund_signatory",
  "other_authorized_signer",
] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];
export const SIGNER_ROLE_LABELS: Record<SignerRole, string> = {
  investor: "Investor",
  joint_investor: "Joint Investor",
  entity_authorized_signer: "Entity Authorized Signer",
  trustee: "Trustee",
  fund_signatory: "Fund Signatory / GP",
  other_authorized_signer: "Other Authorized Signer",
};

export const BLOCK_FIELDS = ["signature", "printed_name", "title", "entity_name", "date_signed", "initials"] as const;
export type BlockField = (typeof BLOCK_FIELDS)[number];
export const BLOCK_FIELD_LABELS: Record<BlockField, string> = {
  signature: "Signature",
  printed_name: "Printed Name",
  title: "Title",
  entity_name: "Entity Name",
  date_signed: "Date Signed",
  initials: "Initials",
};

export type SignerConfig = { role: SignerRole; fields: BlockField[]; order: number };
export type SigningConfig = { signers: SignerConfig[] };

export type VersionApproval = "uploaded_review_required" | "approved" | "superseded";
export type SigningConfigStatus = "not_configured" | "needs_review" | "confirmed";

/** Display state for one version on the Fund Setup screen. */
export type VersionState =
  | "uploaded_review_required"
  | "approved_for_use"
  | "signing_setup_required"
  | "signing_setup_needs_review"
  | "ready_for_use"
  | "superseded";
export const VERSION_STATE_LABELS: Record<VersionState, string> = {
  uploaded_review_required: "Uploaded — Review Required",
  approved_for_use: "Approved for Use",
  signing_setup_required: "Signing Setup Required",
  signing_setup_needs_review: "Signing Setup Needs Review",
  ready_for_use: "Ready for Use",
  superseded: "Superseded",
};

export function versionState(input: {
  approval: VersionApproval;
  usage: DocumentUsage | null;
  signingStatus: SigningConfigStatus;
}): VersionState {
  if (input.approval === "superseded") return "superseded";
  if (input.approval === "uploaded_review_required") return "uploaded_review_required";
  if (!input.usage) return "approved_for_use";
  if (input.usage !== "signature") return "ready_for_use";
  if (input.signingStatus === "confirmed") return "ready_for_use";
  if (input.signingStatus === "needs_review") return "signing_setup_needs_review";
  return "signing_setup_required";
}

/** A new version never inherits "confirmed" signing setup — it must be reviewed. */
export function signingStatusForNewVersion(previous: SigningConfig | null | undefined): SigningConfigStatus {
  return previous && previous.signers.length ? "needs_review" : "not_configured";
}

export function signingConfigErrors(config: SigningConfig, ctx: { hasFundSignatory: boolean }): string[] {
  const errors: string[] = [];
  if (!config.signers.length) errors.push("Add at least one signer role.");
  const seen = new Set<string>();
  for (const s of config.signers) {
    if (!SIGNER_ROLES.includes(s.role)) errors.push("Unknown signer role.");
    if (seen.has(s.role)) errors.push(`${SIGNER_ROLE_LABELS[s.role]} is listed twice.`);
    seen.add(s.role);
    if (!s.fields.includes("signature") && !s.fields.includes("initials")) {
      errors.push(`${SIGNER_ROLE_LABELS[s.role]} needs a signature or initials field.`);
    }
    if (s.fields.some((f) => !BLOCK_FIELDS.includes(f))) errors.push("Unknown signature block field.");
  }
  if (seen.has("fund_signatory") && !ctx.hasFundSignatory) {
    errors.push("Choose the Fund Signatory in Fund Details before adding a Fund/GP countersignature.");
  }
  return errors;
}

export function requiresCountersignature(config: SigningConfig | null | undefined): boolean {
  return !!config?.signers.some((s) => s.role === "fund_signatory");
}

export type Applicability = { profileTypes?: string[]; classKeys?: string[] };

/** Whether a document applies to one Investment (by profile type and class). Empty lists mean "all". */
export function documentApplies(a: Applicability | null | undefined, inv: { profileType: string | null; classKey: string | null }): boolean {
  const p = a?.profileTypes ?? [];
  const c = a?.classKeys ?? [];
  if (p.length && (!inv.profileType || !p.includes(inv.profileType))) return false;
  if (c.length && (!inv.classKey || !c.includes(inv.classKey))) return false;
  return true;
}

export type ProfileRelationship = { role: string; personId: string; canSign?: boolean };

/**
 * Investor-side signer roles come from the Investment's canonical Profile.
 * Beneficial ownership alone never creates signing authority.
 */
export function investorSignerRoles(profileType: string | null, relationships: ProfileRelationship[]): { role: SignerRole; personIds: string[] }[] {
  const t = String(profileType ?? "").toLowerCase();
  const pick = (roles: string[]) => relationships.filter((r) => roles.includes(r.role)).map((r) => r.personId);
  if (t === "joint") return [{ role: "investor", personIds: [] }, { role: "joint_investor", personIds: pick(["joint_owner", "joint_investor"]) }];
  if (t.includes("trust")) return [{ role: "trustee", personIds: pick(["trustee"]) }];
  if (t === "individual" || t === "") return [{ role: "investor", personIds: [] }];
  // Entities (LLC, corporation, partnership, IRA/custodial…): explicit authorized signers only.
  return [{ role: "entity_authorized_signer", personIds: relationships.filter((r) => r.role === "authorized_signer" || (r.role === "control_person" && r.canSign === true)).map((r) => r.personId) }];
}

export type ExecutionState = "not_sent" | "sent" | "partially_signed" | "awaiting_countersignature" | "fully_executed";
export const EXECUTION_STATE_LABELS: Record<ExecutionState, string> = {
  not_sent: "Not sent",
  sent: "Sent for Signature",
  partially_signed: "Partially Signed",
  awaiting_countersignature: "Awaiting Countersignature",
  fully_executed: "Fully Executed",
};

/** Sent ≠ signed; investor-signed ≠ fully executed when a countersignature remains. */
export function executionState(signers: { role: string; status: string; required?: boolean }[]): ExecutionState {
  const req = signers.filter((s) => s.required !== false);
  if (!req.length) return "not_sent";
  const signed = (s: { status: string }) => s.status === "signed" || s.status === "completed";
  if (req.every(signed)) return "fully_executed";
  const investorSide = req.filter((s) => s.role !== "fund_signatory");
  const counter = req.filter((s) => s.role === "fund_signatory");
  if (investorSide.length && investorSide.every(signed) && counter.length && !counter.every(signed)) return "awaiting_countersignature";
  if (req.some(signed)) return "partially_signed";
  return "sent";
}

export type InvestmentDocument = {
  id: string;
  usage: DocumentUsage | null;
  legacyRequiresSignature: boolean;
  activeVersion: number | null;
};

/** Which applicable documents need a signature or an acknowledgment for one Investment. */
export function documentObligations(docs: InvestmentDocument[]) {
  const needsSignature = docs.filter((d) => (d.usage ? d.usage === "signature" : d.legacyRequiresSignature));
  const needsAck = docs.filter((d) => d.usage === "acknowledgment");
  return { needsSignature, needsAck };
}

/** Acknowledgments count only for the version the investor actually acknowledged. */
export function acknowledgmentsComplete(needsAck: InvestmentDocument[], acks: { documentId: string; version: number }[]): boolean {
  return needsAck.every((d) => acks.some((a) => a.documentId === d.id && (d.activeVersion == null || a.version === d.activeVersion)));
}

/** The investor-facing action for one document. No provider terms. */
export function investorDocumentAction(input: { usage: DocumentUsage | null; legacyRequiresSignature: boolean; acknowledged: boolean; execution: ExecutionState }): string {
  const usage = input.usage ?? (input.legacyRequiresSignature ? "signature" : "reference");
  if (usage === "reference") return "Review";
  if (usage === "acknowledgment") return input.acknowledged ? "Completed" : "Acknowledge";
  if (input.execution === "fully_executed") return "Completed";
  if (input.execution === "awaiting_countersignature") return "Signed — awaiting fund signature";
  if (input.execution === "partially_signed" || input.execution === "sent") return "Continue Signing";
  return "Review & Sign";
}

export type SetupDoc = {
  category: DocumentCategory | null;
  usage: DocumentUsage | null;
  activeState: VersionState | null;
  latestState: VersionState | null;
};

/** Fund Setup status — never depends on investors having executed anything. */
export function offeringDocumentsSetupStatus(docs: SetupDoc[]): { status: "not_started" | "in_progress" | "complete"; next: string | null } {
  const configured = docs.filter((d) => d.category);
  if (!configured.length) return { status: "not_started", next: "Upload the offering documents" };
  const pending = configured.find((d) => d.activeState !== "ready_for_use" || (d.latestState && d.latestState !== "ready_for_use" && d.latestState !== "superseded"));
  if (!pending) {
    if (!configured.some((d) => d.category === "subscription_agreement")) return { status: "in_progress", next: "Upload the Subscription Agreement" };
    return { status: "complete", next: null };
  }
  const s = pending.latestState ?? pending.activeState;
  const next =
    s === "uploaded_review_required" ? "Review and approve the uploaded document"
      : s === "approved_for_use" ? "Choose how the document is used"
        : s === "signing_setup_required" || s === "signing_setup_needs_review" ? "Confirm the signing setup"
          : "Activate the approved version";
  return { status: "in_progress", next };
}

/** Investor Impact before a new version replaces the active one. Nothing is changed automatically. */
export function versionChangeImpact(investments: { executedVersion: number | null; execution: ExecutionState; profileType: string | null; classKey: string | null }[], activeVersion: number | null) {
  const onOld = investments.filter((i) => activeVersion != null);
  return {
    executedOldVersion: onOld.filter((i) => i.execution === "fully_executed" && i.executedVersion === activeVersion).length,
    awaitingSignature: onOld.filter((i) => ["sent", "partially_signed", "awaiting_countersignature"].includes(i.execution)).length,
    notYetSent: investments.filter((i) => i.execution === "not_sent").length,
    profileTypes: [...new Set(investments.map((i) => i.profileType).filter(Boolean))] as string[],
    classKeys: [...new Set(investments.map((i) => i.classKey).filter(Boolean))] as string[],
  };
}
