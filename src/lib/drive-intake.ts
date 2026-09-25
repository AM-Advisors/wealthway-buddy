/**
 * Drive File Intake — pure rules. Super Administrators locate existing files in
 * the approved Drive repositories and import a Harmonious-owned copy. Drive is
 * source/provenance only; nothing here ever writes to Drive.
 */
import {
  neverInDrive,
  type DriveClassification,
  type DriveEnvironment,
  type DriveRepository,
  type RepositoryConfig,
} from "@/lib/drive-policy";

export const RESTRICTED_EVIDENCE_MESSAGE = "This document requires the restricted evidence workflow.";
export const ALREADY_IN_HARMONIOUS = "Already in Harmonious";
export const OUTSIDE_REPOSITORY = "That file is not inside an approved Harmonious Drive repository.";

/** Initially Super Administrators only. Staff "admin" and every client role are refused. */
export function canUseDriveIntake(roles: readonly string[]): boolean {
  return roles.includes("super_admin");
}

/** QA context may only read the QA root; production may only read the two production roots. */
export function repositoriesFor(env: DriveEnvironment): DriveRepository[] {
  return env === "test" ? ["test"] : ["fund", "investor"];
}

export type FileFacts = {
  id: string;
  name: string;
  mimeType: string;
  trashed?: boolean;
  driveId?: string | null;
  /** Folder ids from the direct parent up to the shared drive, nearest first. */
  ancestors: string[];
  size?: number | null;
  modifiedTime?: string | null;
  md5Checksum?: string | null;
};

/**
 * The file must sit below the chosen repository's root in the chosen shared
 * drive, for the current environment. A pasted id is never trusted on its own.
 */
export function sourceProblem(
  facts: FileFacts | null,
  repo: DriveRepository,
  env: DriveEnvironment,
  config: RepositoryConfig,
): string | null {
  if (!repositoriesFor(env).includes(repo)) {
    return env === "test" ? "QA records cannot import from production Drive." : "Production records cannot import from the QA Drive.";
  }
  const root = config[repo];
  if (!root) return "That Drive repository is not configured.";
  if (!facts) return "That file no longer exists or Harmonious cannot see it.";
  if (facts.trashed) return "That file is in the trash.";
  if (facts.mimeType === "application/vnd.google-apps.folder") return "That is a folder, not a file.";
  if (facts.driveId !== root.driveId || !facts.ancestors.includes(root.rootId)) return OUTSIDE_REPOSITORY;
  for (const other of repositoriesFor(env === "test" ? "production" : "test")) {
    const o = config[other];
    if (o && (facts.driveId === o.driveId || facts.ancestors.includes(o.rootId))) return OUTSIDE_REPOSITORY;
  }
  return null;
}

export const SUPPORTED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "image/png",
  "image/jpeg",
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
] as const;

/** Google-native files are exported to a fixed format; everything else is copied byte-for-byte. */
export function exportFormat(mime: string): string | null {
  if (mime === "application/vnd.google-apps.document") return "application/pdf";
  if (mime === "application/vnd.google-apps.spreadsheet") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return null;
}

// ---------------------------------------------------------------------------
// Taxonomy — the same Fund/Investor document kinds already used by the Drive
// filing router (filingTargets / classifyDocument). No second taxonomy.
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = {
  fund: {
    formation: "Formation document",
    operating_agreement: "Operating / LP agreement",
    regulatory_filing: "Regulatory filing",
    banking: "Banking document",
    financial_report: "Financial report",
    tax_deliverable: "Tax deliverable",
    other_fund: "Other Fund document",
  },
  investor: {
    subscription_agreement: "Subscription agreement",
    executed_subscription_agreement: "Executed subscription agreement",
    accreditation_evidence: "Accreditation evidence",
    side_letter: "Side letter",
    investor_correspondence: "Investor correspondence / document",
    other_investor: "Other approved Investor document",
  },
} as const;

export type DocumentCategory = keyof typeof DOCUMENT_TYPES;
export function documentTypeLabel(category: DocumentCategory, type: string): string | null {
  return (DOCUMENT_TYPES[category] as Record<string, string>)[type] ?? null;
}

/** Tax/KYC/ID/AML evidence never enters through the general importer. */
export function isRestrictedEvidence(name: string, description?: string | null): boolean {
  return neverInDrive(`${name} ${description ?? ""}`) || /\b(didit|biometric|selfie|sanction|ofac|kyb|social security)\b/i.test(`${name} ${description ?? ""}`);
}

/**
 * Relabelling cannot make a broadly shared file secure. Investor Restricted
 * content arriving from the broad Fund repository, and anything labelled
 * Harmonious Restricted, needs an explicit acknowledgement that the copy goes
 * to private Harmonious storage and the Drive original stays as broad as it was.
 */
export function classificationWarning(classification: DriveClassification, source: DriveRepository): string | null {
  if (classification === "harmonious_restricted") {
    return "Harmonious Restricted content should never have been in Drive. The copy will be kept in private Harmonious storage only; the Drive original remains visible to everyone who can open it today.";
  }
  if (classification === "investor_restricted" && source === "fund") {
    return "This file sits in the broad Fund Records drive, so every member of that drive can already open it. Importing copies it into private Harmonious storage; relabelling does not make the Drive original secure.";
  }
  if (classification !== "fund_general" && source === "fund") {
    return "Investor-level document found in the Fund Records drive. The Harmonious copy will be restricted, but the Drive original is not.";
  }
  return null;
}

export type AssociationRow = {
  driveFileId: string;
  repository: DriveRepository;
  offeringId: string | null;
  profileId?: string | null;
  onboardingId?: string | null;
  category: DocumentCategory | null;
  documentType: string | null;
  classification: DriveClassification | null;
  documentDate?: string | null;
  recordStatus: "historical" | "active" | null;
  historicalExecuted?: boolean;
  description?: string | null;
  acknowledgeBroadSource?: boolean;
};

/** Everything a row needs before it can be imported. Filenames never supply identity. */
export function rowProblems(row: AssociationRow, fileName: string): string[] {
  const out: string[] = [];
  if (isRestrictedEvidence(fileName, row.description)) return [RESTRICTED_EVIDENCE_MESSAGE];
  if (!row.offeringId) out.push("Choose the Fund.");
  if (!row.category) out.push("Choose the document category.");
  else if (!row.documentType || !documentTypeLabel(row.category, row.documentType)) out.push("Choose a document type.");
  if (row.category === "investor" && !row.profileId) out.push("Choose the Investor / Investment Profile.");
  if (row.category === "fund" && row.profileId) out.push("A Fund document cannot be attached to an investor profile.");
  if (!row.classification) out.push("Choose an access classification.");
  if (row.category === "fund" && row.classification && row.classification !== "fund_general" && row.classification !== "harmonious_restricted") {
    out.push("Fund documents are Fund General or Harmonious Restricted.");
  }
  if (row.category === "investor" && row.classification === "fund_general") out.push("Investor documents cannot be Fund General.");
  if (!row.recordStatus) out.push("Say whether this is a historical record or a current document.");
  if (row.historicalExecuted && row.recordStatus !== "historical") out.push("Only historical records can be marked historically executed.");
  if (row.documentDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.documentDate)) out.push("Use a YYYY-MM-DD document date.");
  if (row.classification && classificationWarning(row.classification, row.repository) && !row.acknowledgeBroadSource) {
    out.push("Acknowledge the source-location warning.");
  }
  return out;
}

/**
 * Context from the Drive hierarchy, taken only from Harmonious-tagged folder
 * mappings. Prefill only; the administrator still confirms.
 */
export type MappingRef = { id: string; folder_id: string | null; offering_id: string; investment_profile_id: string | null; entity_kind: string };
export function prefillFromHierarchy(ancestors: string[], mappings: MappingRef[]) {
  for (const folder of ancestors) {
    const m = mappings.find((x) => x.folder_id === folder);
    if (m) return { mappingId: m.id, offeringId: m.offering_id, profileId: m.entity_kind === "investor" ? m.investment_profile_id : null };
  }
  return { mappingId: null, offeringId: null, profileId: null };
}

/**
 * A file under another Fund's or another profile's mapped folder can never be
 * associated with this Fund/profile.
 */
export function contextConflict(ancestors: string[], mappings: MappingRef[], offeringId: string, profileId: string | null): string | null {
  for (const folder of ancestors) {
    const m = mappings.find((x) => x.folder_id === folder);
    if (!m) continue;
    if (m.offering_id !== offeringId) return "That file sits in another Fund's Drive folder.";
    if (m.entity_kind === "investor" && m.investment_profile_id !== profileId) {
      return "That file sits in a different investor profile's Drive folder.";
    }
  }
  return null;
}

export type PriorImport = {
  id: string;
  drive_file_id: string;
  sha256: string;
  drive_modified_at: string | null;
  drive_md5: string | null;
  version_number: number;
  offering_id: string;
  investment_profile_id: string | null;
};

export type DuplicateDecision =
  | { kind: "new" }
  | { kind: "already_imported"; existing: PriorImport }
  | { kind: "changed_source"; latest: PriorImport };

/** Decide before downloading: same Drive revision → already imported; changed → new-version only by choice. */
export function duplicateBeforeDownload(fileId: string, modifiedTime: string | null, md5: string | null, prior: PriorImport[]): DuplicateDecision {
  const same = prior.filter((p) => p.drive_file_id === fileId).sort((a, b) => b.version_number - a.version_number);
  if (!same.length) return { kind: "new" };
  const latest = same[0];
  const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
  const unchanged = md5 && latest.drive_md5 ? md5 === latest.drive_md5 : iso(modifiedTime) === iso(latest.drive_modified_at);
  return unchanged ? { kind: "already_imported", existing: latest } : { kind: "changed_source", latest };
}

/** After hashing: identical bytes anywhere in this environment are never stored twice. */
export function duplicateByHash(sha256: string, prior: PriorImport[]): PriorImport | null {
  return prior.find((p) => p.sha256 === sha256) ?? null;
}

export function nextVersion(fileId: string, prior: PriorImport[]): { version: number; previousId: string | null } {
  const same = prior.filter((p) => p.drive_file_id === fileId).sort((a, b) => b.version_number - a.version_number);
  return same.length ? { version: same[0].version_number + 1, previousId: same[0].id } : { version: 1, previousId: null };
}

/** Importing evidence never approves anything; it only queues review. */
export function reviewStateFor(category: DocumentCategory, documentType: string): "evidence_received_needs_review" | "not_applicable" {
  return category === "investor" && documentType === "accreditation_evidence" ? "evidence_received_needs_review" : "not_applicable";
}

/** A Drive copy is at most an administrator's historical attestation — never Box-verified. */
export function executionEvidenceFor(row: Pick<AssociationRow, "historicalExecuted" | "recordStatus">): "historical_executed" | "none" {
  return row.historicalExecuted && row.recordStatus === "historical" ? "historical_executed" : "none";
}

export const EXECUTION_LABELS = {
  none: "Not execution evidence",
  historical_executed: "Historical executed document (administrator attestation, not Box-verified)",
  box_verified: "Box-verified executed document",
} as const;

export function storagePathFor(env: DriveEnvironment, offeringId: string, docId: string, fileName: string) {
  const ext = (fileName.match(/\.[A-Za-z0-9]{1,6}$/)?.[0] ?? "").toLowerCase();
  return `${env}/${offeringId}/${docId}${ext}`;
}
