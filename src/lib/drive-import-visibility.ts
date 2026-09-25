/**
 * Who may see a document imported from Google Drive inside the normal
 * Harmonious document experience. Pure rules — the server applies them to
 * every list, search and open request. An import never widens access: the
 * rules below are the same (or narrower) than the equivalent native document.
 */
import { hasOperationsEntry } from "@/lib/ops-capabilities";
import { canUseDriveIntake } from "@/lib/drive-intake";

export type ImportedDoc = {
  id: string;
  offering_id: string;
  investment_profile_id: string | null;
  category: string; // "fund" | "investor"
  document_type: string;
  classification: string; // fund_general | investor_general | investor_restricted | harmonious_restricted
  record_status: string; // historical | current | archived | superseded
  execution_evidence: string;
  review_state: string;
  version_number: number;
  previous_version_id: string | null;
  original_filename: string;
  description?: string | null;
  document_date?: string | null;
  imported_at: string;
  imported_by: string;
};

export type Viewer = {
  roles: readonly string[];
  managedOfferingIds: readonly string[];
  /** Investment Profiles this person invests through, with the fund of each investment. */
  ownInvestments: readonly { offeringId: string; profileId: string }[];
};

/** Fund General types an investor in that fund may read. Banking, filings and tax stay with the manager. */
const INVESTOR_FUND_TYPES = new Set(["formation", "operating_agreement", "financial_report"]);
/** Investor-restricted types the investor themself may read (their own agreements). */
const OWNER_RESTRICTED_TYPES = new Set(["subscription_agreement", "executed_subscription_agreement", "side_letter"]);
/** Never visible to a fund manager, whatever the classification says (accreditation privacy). */
const NEVER_MANAGER_TYPES = new Set(["accreditation_evidence"]);

export type Audience = "staff" | "manager" | "investor";

/** Tab + import action: Super Administrators only. Navigation is UX; the server re-checks. */
export function showDriveImportTab(roles: readonly string[]): boolean {
  return canUseDriveIntake(roles);
}

export function isStaff(v: Viewer) {
  return hasOperationsEntry([...v.roles]);
}

function ownsProfile(v: Viewer, doc: ImportedDoc) {
  return Boolean(
    doc.investment_profile_id &&
      v.ownInvestments.some((i) => i.profileId === doc.investment_profile_id && i.offeringId === doc.offering_id),
  );
}

function investsInFund(v: Viewer, offeringId: string) {
  return v.ownInvestments.some((i) => i.offeringId === offeringId);
}

/** How this viewer may see the document, or null when they may not see it at all. */
export function audienceFor(v: Viewer, doc: ImportedDoc): Audience | null {
  if (doc.record_status === "archived" || doc.record_status === "superseded") return isStaff(v) ? "staff" : null;
  if (isStaff(v)) return "staff";
  const c = doc.classification;
  if (c === "harmonious_restricted") return null;

  const manages = v.managedOfferingIds.includes(doc.offering_id);
  if (c === "fund_general") {
    if (manages) return "manager";
    if (investsInFund(v, doc.offering_id) && INVESTOR_FUND_TYPES.has(doc.document_type)) return "investor";
    return null;
  }
  // Investor-level: the association must match exactly; being in the fund is not enough.
  if (!doc.investment_profile_id) return null;
  if (c === "investor_general") {
    if (ownsProfile(v, doc)) return "investor";
    if (manages && !NEVER_MANAGER_TYPES.has(doc.document_type)) return "manager";
    return null;
  }
  if (c === "investor_restricted") {
    if (ownsProfile(v, doc) && OWNER_RESTRICTED_TYPES.has(doc.document_type)) return "investor";
    return null; // managers never gain restricted investor records through an import
  }
  return null;
}

/** Newest version of each document chain; older versions stay in history. */
export function currentVersions<T extends Pick<ImportedDoc, "id" | "previous_version_id">>(docs: T[]): T[] {
  const replaced = new Set(docs.map((d) => d.previous_version_id).filter(Boolean) as string[]);
  return docs.filter((d) => !replaced.has(d.id));
}

/** Oldest → newest chain ending at `id`. */
export function versionHistory<T extends Pick<ImportedDoc, "id" | "previous_version_id">>(docs: T[], id: string): T[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const out: T[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.previous_version_id ? byId.get(cur.previous_version_id) : undefined;
  }
  return out;
}

export const EXECUTION_PRESENTATION = {
  historical_executed: "Historical Executed — Administrator Attestation",
  box_verified: "Fully Executed — Box Verified",
  none: null,
} as const;

/** A Drive copy is never presented as Box-verified, whatever was stored. */
export function executionLabel(evidence: string): string | null {
  return evidence === "historical_executed" ? EXECUTION_PRESENTATION.historical_executed : null;
}

export function reviewLabel(state: string): string | null {
  return state === "evidence_received_needs_review" ? "Evidence received — needs review" : null;
}

export type VisibleImport = {
  id: string;
  offeringId: string;
  profileId: string | null;
  title: string;
  documentType: string;
  date: string | null;
  version: number;
  status: string;
  execution: string | null;
  review: string | null;
  /** Staff only: provenance. */
  source?: { label: "Google Drive"; importedAt: string; importedBy: string; classification: string; history: number };
};

/** Shape a row for this audience. Clients never receive Drive provenance. */
export function presentImport(doc: ImportedDoc, audience: Audience, all: ImportedDoc[], typeLabel: string, importerName?: string): VisibleImport {
  const row: VisibleImport = {
    id: doc.id,
    offeringId: doc.offering_id,
    profileId: audience === "staff" ? doc.investment_profile_id : null,
    title: doc.original_filename,
    documentType: typeLabel,
    date: doc.document_date ?? null,
    version: doc.version_number,
    status: doc.record_status === "historical" ? "Historical" : doc.record_status === "current" ? "Current" : doc.record_status,
    execution: executionLabel(doc.execution_evidence),
    review: audience === "manager" ? null : reviewLabel(doc.review_state),
  };
  if (audience === "staff") {
    row.source = {
      label: "Google Drive",
      importedAt: doc.imported_at,
      importedBy: importerName ?? "Super Administrator",
      classification: doc.classification,
      history: versionHistory(all, doc.id).length,
    };
  }
  return row;
}

/** The single visibility pipeline used by lists and search alike. */
export function visibleImports(v: Viewer, docs: ImportedDoc[], opts: { offeringId?: string | undefined; search?: string | undefined } = {}) {
  const term = (opts.search ?? "").trim().toLowerCase();
  return currentVersions(docs)
    .filter((d) => !opts.offeringId || d.offering_id === opts.offeringId)
    .map((d) => ({ doc: d, audience: audienceFor(v, d) }))
    .filter((x): x is { doc: ImportedDoc; audience: Audience } => x.audience !== null)
    .filter(({ doc }) => !term || `${doc.original_filename} ${doc.description ?? ""} ${doc.document_type}`.toLowerCase().includes(term));
}
