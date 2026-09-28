/**
 * Investor Google Drive connection — pure rules (read-only intake).
 * Drive is never the source of identity, compliance, ownership or permissions.
 */
import { neverInDrive, classifyDocument, type DriveClassification } from "@/lib/drive-policy";
import { isRestrictedEvidence } from "@/lib/drive-intake";

export const BLOCKED_MESSAGE = "Blocked — this document type cannot be imported from Google Drive.";
export const UPDATED_MESSAGE = "Updated in Google Drive — review new version";
export const ALREADY_IMPORTED = "Already imported";
export const OUTSIDE_APPROVED = "That folder is outside the approved Restricted Investor Records repository.";

const EXTRA_BLOCK = /\b(w-?8\w*|w-?9|tax[ _-]?intake|driver'?s?[ _-]?licen[cs]e|passport|government[ _-]?id|id[ _-]?card|biometric|selfie|didit|kyc|kyb|aml|ofac|sanctions?|password|credential|api[ _-]?key|secret|login)\b/i;

/** Prohibited content is blocked with no override. */
export function isBlockedFromInvestorDrive(name: string, description?: string | null): boolean {
  const t = `${name} ${description ?? ""}`;
  return neverInDrive(t) || isRestrictedEvidence(name, description) || EXTRA_BLOCK.test(t.replace(/[_.]/g, " "));
}

export type FolderFacts = { id: string; mimeType: string; driveId: string | null; ancestors: string[]; trashed?: boolean } | null;

/** The selected folder must be a live folder beneath the configured root of the configured drive. */
export function folderProblem(facts: FolderFacts, root: { driveId: string; rootId: string } | null): string | null {
  if (!root) return "Investor Drive filing unavailable — repository permissions require review";
  if (!facts || facts.trashed) return "That Drive folder could not be found.";
  if (facts.mimeType !== "application/vnd.google-apps.folder") return "Choose a folder, not a file.";
  if (facts.driveId !== root.driveId) return OUTSIDE_APPROVED;
  if (facts.id === root.rootId) return "Choose the investor's own folder, not the repository root.";
  if (!facts.ancestors.includes(root.rootId)) return OUTSIDE_APPROVED;
  return null;
}

export type PriorImport = { id: string; drive_file_id: string; drive_modified_at: string | null; drive_md5: string | null; offering_id: string | null; investment_profile_id: string | null; version_number: number };
export type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string | null; md5Checksum: string | null };

export type FileStatus = "new" | "updated" | "current" | "blocked" | "other_context";

/** Compare what Drive shows against what Harmonious already holds for this exact Fund + profile. */
export function fileStatus(file: DriveFile, prior: PriorImport[], ctx: { offeringId: string; profileId: string }): FileStatus {
  if (isBlockedFromInvestorDrive(file.name)) return "blocked";
  const mine = prior.filter((p) => p.drive_file_id === file.id);
  if (!mine.length) return "new";
  if (mine.some((p) => p.offering_id !== ctx.offeringId || p.investment_profile_id !== ctx.profileId)) {
    if (!mine.some((p) => p.offering_id === ctx.offeringId && p.investment_profile_id === ctx.profileId)) return "other_context";
  }
  const latest = [...mine].sort((a, b) => b.version_number - a.version_number)[0]!;
  const same = (file.md5Checksum && latest.drive_md5 ? file.md5Checksum === latest.drive_md5 : true) && (file.modifiedTime ?? null) === (latest.drive_modified_at ? new Date(latest.drive_modified_at).toISOString() : null) ? true : Boolean(file.md5Checksum && latest.drive_md5 && file.md5Checksum === latest.drive_md5);
  return same ? "current" : "updated";
}

/** Harmonious copies whose Drive original is gone stay in Harmonious — reported, never deleted. */
export function missingFromDrive(files: DriveFile[], prior: PriorImport[], ctx: { offeringId: string; profileId: string }): string[] {
  const present = new Set(files.map((f) => f.id));
  return prior.filter((p) => p.offering_id === ctx.offeringId && p.investment_profile_id === ctx.profileId && !present.has(p.drive_file_id)).map((p) => p.id);
}

export const STATUS_LABELS: Record<FileStatus, string> = {
  new: "New in Drive",
  updated: UPDATED_MESSAGE,
  current: "Current",
  blocked: BLOCKED_MESSAGE,
  other_context: "Needs Review — imported for a different fund or profile",
};

/** Proposed classification is a suggestion; it never approves anything. */
export function proposedClassification(name: string): { classification: DriveClassification; documentType: string } {
  const c = classifyDocument(null, name);
  const t = name.toLowerCase();
  const documentType = /accredit|verification letter/.test(t) ? "accreditation_evidence" : /subscription|joinder|questionnaire/.test(t) ? "subscription_agreement" : "other";
  return { classification: c === "fund_general" || c === "harmonious_restricted" ? "investor_restricted" : c, documentType };
}

/** Drive status indicator for an investor row. */
export function driveIndicator(connected: boolean, check: { updated?: number; needsReview?: number } | null): "Connected" | "Not Connected" | "Updates Available" | "Needs Review" {
  if (!connected) return "Not Connected";
  if (check?.needsReview) return "Needs Review";
  if (check?.updated) return "Updates Available";
  return "Connected";
}
