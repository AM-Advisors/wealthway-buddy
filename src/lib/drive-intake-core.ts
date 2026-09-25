/**
 * Drive File Intake orchestration with injected ports, so every rule can be
 * proven in tests. The Drive port is read-only by construction: it has no
 * write, move, rename, trash or permission method.
 */
import type { DriveEnvironment, RepositoryConfig } from "@/lib/drive-policy";
import {
  ALREADY_IN_HARMONIOUS,
  RESTRICTED_EVIDENCE_MESSAGE,
  contextConflict,
  duplicateBeforeDownload,
  duplicateByHash,
  executionEvidenceFor,
  exportFormat,
  isRestrictedEvidence,
  nextVersion,
  reviewStateFor,
  rowProblems,
  sourceProblem,
  storagePathFor,
  SUPPORTED_MIME,
  type AssociationRow,
  type FileFacts,
  type MappingRef,
  type PriorImport,
} from "@/lib/drive-intake";

export interface DriveReadPort {
  fileFacts(id: string): Promise<FileFacts | null>;
  download(facts: FileFacts, exportMime: string | null): Promise<Uint8Array>;
}

export interface IntakeStore {
  priorImports(env: DriveEnvironment): Promise<PriorImport[]>;
  mappings(): Promise<MappingRef[]>;
  /** The onboarding id if this profile is really invested in this fund, else null. */
  investment(offeringId: string, profileId: string, onboardingId?: string | null): Promise<string | null>;
  putFile(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  insertDocument(row: Record<string, unknown>): Promise<{ id: string }>;
  insertAssociation(row: Record<string, unknown>): Promise<"created" | "exists">;
  hasAssociation(docId: string, offeringId: string, profileId: string | null): Promise<boolean>;
  log(event: string, outcome: string, detail: Record<string, unknown>): Promise<void>;
}

export type ImportRequest = AssociationRow & { importAsNewVersion?: boolean; addAssociationToExisting?: boolean };

export type ImportResult =
  | { driveFileId: string; ok: true; outcome: "imported" | "new_version" | "associated"; documentId: string }
  | { driveFileId: string; ok: false; outcome: "rejected" | "restricted_evidence" | "already_imported" | "changed_source" | "unavailable" | "failed"; message: string; existingDocumentId?: string };

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Import one row. Never throws; each row succeeds or fails on its own. */
export async function importOne(
  req: ImportRequest,
  ctx: { env: DriveEnvironment; config: RepositoryConfig; userId: string; drive: DriveReadPort; store: IntakeStore; newId?: () => string },
): Promise<ImportResult> {
  const { drive, store } = ctx;
  const base = { repository: req.repository, drive_file_id: req.driveFileId, offering_id: req.offeringId, investment_profile_id: req.profileId ?? null };
  const fail = async (outcome: Exclude<ImportResult, { ok: true }>["outcome"], message: string, extra: Record<string, unknown> = {}) => {
    await store.log(outcome === "restricted_evidence" ? "restricted_evidence_rejected" : outcome === "already_imported" ? "duplicate_prevented" : outcome === "unavailable" ? "source_unavailable" : "import_failed", outcome, { ...base, message, ...extra });
    return { driveFileId: req.driveFileId, ok: false as const, outcome, message, ...(extra["existingDocumentId"] ? { existingDocumentId: String(extra["existingDocumentId"]) } : {}) };
  };
  try {
    let facts: FileFacts | null;
    try {
      facts = await drive.fileFacts(req.driveFileId);
    } catch {
      return fail("unavailable", "The Drive file could not be reached.");
    }
    const src = sourceProblem(facts, req.repository, ctx.env, ctx.config);
    if (src) return fail(facts ? "rejected" : "unavailable", src);
    const f = facts as FileFacts;
    if (isRestrictedEvidence(f.name, req.description)) return fail("restricted_evidence", RESTRICTED_EVIDENCE_MESSAGE);
    if (!(SUPPORTED_MIME as readonly string[]).includes(f.mimeType)) return fail("rejected", "That file type cannot be imported.");
    const problems = rowProblems(req, f.name);
    if (problems.length) return fail("rejected", problems.join(" "));
    const offeringId = req.offeringId as string;
    const profileId = req.category === "investor" ? (req.profileId as string) : null;
    const mappings = await store.mappings();
    const conflict = contextConflict(f.ancestors, mappings, offeringId, profileId);
    if (conflict) return fail("rejected", conflict);
    let onboardingId: string | null = null;
    if (profileId) {
      onboardingId = await store.investment(offeringId, profileId, req.onboardingId ?? null);
      if (!onboardingId) return fail("rejected", "That investor profile has no investment in this Fund.");
    }

    const prior = await store.priorImports(ctx.env);
    const dup = duplicateBeforeDownload(f.id, f.modifiedTime ?? null, f.md5Checksum ?? null, prior);
    if (dup.kind === "already_imported") {
      return associateExisting(dup.existing, req, offeringId, profileId, onboardingId, ctx, fail);
    }
    if (dup.kind === "changed_source" && !req.importAsNewVersion) {
      return fail("changed_source", "The Drive file changed since it was imported. Choose Import as New Version to keep both.", { existingDocumentId: dup.latest.id });
    }

    const exportMime = exportFormat(f.mimeType);
    const bytes = await drive.download(f, exportMime);
    const sha = await sha256Hex(bytes);
    const same = duplicateByHash(sha, prior);
    if (same) return associateExisting(same, req, offeringId, profileId, onboardingId, ctx, fail);

    const { version, previousId } = nextVersion(f.id, prior);
    const id = (ctx.newId ?? (() => crypto.randomUUID()))();
    const storedMime = exportMime ?? f.mimeType;
    const path = storagePathFor(ctx.env, offeringId, id, exportMime === "application/pdf" ? `${f.name}.pdf` : f.name);
    await store.putFile(path, bytes, storedMime);
    const mapping = f.ancestors.map((a) => mappings.find((m) => m.folder_id === a)).find(Boolean);
    const doc = await store.insertDocument({
      id,
      environment: ctx.env,
      source_repository: req.repository,
      drive_file_id: f.id,
      drive_id: f.driveId,
      source_parent_id: f.ancestors[0] ?? null,
      source_mapping_id: mapping?.id ?? null,
      original_filename: f.name,
      mime_type: storedMime,
      size_bytes: bytes.length,
      drive_modified_at: f.modifiedTime ?? null,
      drive_md5: f.md5Checksum ?? null,
      sha256: sha,
      storage_path: path,
      version_number: version,
      previous_version_id: previousId,
      offering_id: offeringId,
      investment_profile_id: profileId,
      onboarding_id: onboardingId,
      category: req.category,
      document_type: req.documentType,
      classification: req.classification,
      document_date: req.documentDate || null,
      record_status: req.recordStatus,
      execution_evidence: executionEvidenceFor(req),
      review_state: reviewStateFor(req.category!, req.documentType!),
      broad_source_acknowledged: Boolean(req.acknowledgeBroadSource),
      description: req.description?.trim() || null,
      imported_by: ctx.userId,
    });
    await store.log(previousId ? "version_imported" : "imported", "ok", {
      ...base,
      document_id: doc.id,
      classification: req.classification,
      document_type: req.documentType,
      version,
      execution_evidence: executionEvidenceFor(req),
    });
    return { driveFileId: req.driveFileId, ok: true, outcome: previousId ? "new_version" : "imported", documentId: doc.id };
  } catch (e: any) {
    return fail("failed", String(e?.message ?? "Import failed").slice(0, 300));
  }
}

async function associateExisting(
  existing: PriorImport,
  req: ImportRequest,
  offeringId: string,
  profileId: string | null,
  onboardingId: string | null,
  ctx: { userId: string; store: IntakeStore },
  fail: (o: any, m: string, extra?: Record<string, unknown>) => Promise<ImportResult>,
): Promise<ImportResult> {
  const primary = existing.offering_id === offeringId && existing.investment_profile_id === profileId;
  if (primary || (await ctx.store.hasAssociation(existing.id, offeringId, profileId)) || !req.addAssociationToExisting) {
    return fail("already_imported", ALREADY_IN_HARMONIOUS, { existingDocumentId: existing.id });
  }
  // Only the same Fund may share one copy (e.g. several profiles on one side letter); never across Funds.
  if (existing.offering_id !== offeringId) {
    return fail("rejected", "This copy belongs to another Fund and cannot be associated here.", { existingDocumentId: existing.id });
  }
  await ctx.store.insertAssociation({ document_id: existing.id, offering_id: offeringId, investment_profile_id: profileId, onboarding_id: onboardingId, associated_by: ctx.userId });
  await ctx.store.log("additional_association", "ok", { document_id: existing.id, offering_id: offeringId, investment_profile_id: profileId });
  return { driveFileId: req.driveFileId, ok: true, outcome: "associated", documentId: existing.id };
}
