/**
 * Google Drive access policy. Harmonious authorization is decided elsewhere and
 * never widened to match Drive; this module only decides whether Drive is a
 * safe place to put something, and whether a pasted folder may be linked.
 */

export const DRIVE_CLASSIFICATIONS = [
  "fund_general",
  "investor_general",
  "investor_restricted",
  "harmonious_restricted",
] as const;
export type DriveClassification = (typeof DRIVE_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABELS: Record<DriveClassification, string> = {
  fund_general: "Fund General",
  investor_general: "Investor General",
  investor_restricted: "Investor Restricted",
  harmonious_restricted: "Harmonious Restricted",
};

/** Content that never goes to Drive at all, whatever the destination. */
export function neverInDrive(text: string | null | undefined): boolean {
  const t = String(text ?? "");
  return /\bw-?(9|8[a-z-]*)\b/i.test(t) || /\b(kyc|aml|government[ _-]?id|passport|driver'?s? licen[cs]e|ssn|tin)\b/i.test(t);
}

/** Classify by what the document is, never by the folder it would land in. */
export function classifyDocument(docType: string | null | undefined, title?: string | null): DriveClassification {
  const t = `${docType ?? ""} ${title ?? ""}`.toLowerCase();
  if (/(compliance|aml|bsa|sanction|bad actor|screening|risk)/.test(t)) return "harmonious_restricted";
  if (/(accredit|subscription|questionnaire|certification|suitability)/.test(t)) return "investor_restricted";
  if (/(formation|certificate of|operating agreement|lpa|limited partnership agreement|ppm|memorandum|regulatory|form d|ein|ss-4)/.test(t) && !/(joinder|signature page)/.test(t)) {
    return "fund_general";
  }
  return "investor_general";
}

export type DrivePrincipal = { type: string; role: string; email?: string | null; domain?: string | null };
export type DestinationAudit = {
  /** True when the destination (or an ancestor below the shared drive) is a limited-access folder. */
  limitedAccess: boolean;
  principals: DrivePrincipal[];
};

export type DestinationDecision = { allowed: true } | { allowed: false; reason: string };

export const WITHHELD_MESSAGE = "Drive filing withheld — destination permissions too broad";

/**
 * Decide whether a document of this classification may be filed where the
 * audit says it would be visible. `approvedAudience` is the explicit list of
 * people approved for restricted investor records; empty means nobody is.
 */
export function destinationDecision(
  classification: DriveClassification,
  audit: DestinationAudit,
  approvedAudience: readonly string[] = [],
): DestinationDecision {
  const publicLink = audit.principals.some((p) => p.type === "anyone" || p.type === "domain");
  if (classification === "harmonious_restricted") {
    return { allowed: false, reason: `${WITHHELD_MESSAGE} (Harmonious-restricted content stays in Harmonious).` };
  }
  if (publicLink) return { allowed: false, reason: `${WITHHELD_MESSAGE} (link or domain sharing).` };
  if (classification === "investor_restricted") {
    if (!audit.limitedAccess) {
      return { allowed: false, reason: `${WITHHELD_MESSAGE} (every shared-drive member inherits access).` };
    }
    const approved = new Set(approvedAudience.map((e) => e.toLowerCase()));
    const outsider = audit.principals.find(
      (p) => p.type === "group" || !p.email || !approved.has(String(p.email).toLowerCase()),
    );
    if (outsider) return { allowed: false, reason: `${WITHHELD_MESSAGE} (${outsider.email ?? outsider.type} is not approved).` };
  }
  return { allowed: true };
}

/**
 * Fund managers and investors never get Google Drive folders. Drive access
 * here is inherited by every shared-drive member and cannot preserve the
 * Harmonious boundary, so documents keep flowing through the portal.
 */
export function managerMayOpenDriveFolder(): false {
  return false;
}
export function investorMayOpenDriveFolder(): false {
  return false;
}

export type DriveEnvironment = "production" | "test";

export function rootFor(env: DriveEnvironment, roots: { production: string; test?: string | null }): string {
  if (env === "production") return roots.production;
  if (!roots.test) throw new Error("No QA Google Drive root is configured; test records never fall back to production.");
  return roots.test;
}

export const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;

export type FolderFacts = {
  id: string;
  mimeType: string;
  trashed?: boolean;
  driveId?: string | null;
  /** Folder ids from the folder up to the shared drive, nearest first. */
  ancestors: string[];
};

export type LinkCheckInput = {
  folder: FolderFacts | null;
  expectedDriveId: string;
  root: string;
  otherRoot?: string | null;
  /** Mapping keys that already hold this folder id. */
  mappedTo: string[];
  targetKey: string;
};

/** Server-side validation of a pasted folder id before it is ever linked. */
export function linkProblem(input: LinkCheckInput): string | null {
  const f = input.folder;
  if (!f) return "That Drive folder does not exist or Harmonious cannot see it.";
  if (!DRIVE_ID_PATTERN.test(f.id)) return "That is not a valid Drive folder ID.";
  if (f.trashed) return "That folder is in the trash.";
  if (f.mimeType !== "application/vnd.google-apps.folder") return "That ID is a file, not a folder.";
  if (f.driveId !== input.expectedDriveId) return "That folder is not in the Harmonious Team shared drive.";
  if (f.id === input.root) return "The root folder itself cannot be linked to a fund.";
  if (input.otherRoot && (f.id === input.otherRoot || f.ancestors.includes(input.otherRoot))) {
    return "That folder belongs to the other environment's root.";
  }
  if (!f.ancestors.includes(input.root)) return "That folder is not inside the expected Funds root.";
  const elsewhere = input.mappedTo.filter((k) => k !== input.targetKey);
  if (elsewhere.length) return "That folder is already linked to another fund or investor.";
  return null;
}

/** One open task per underlying problem; retries bump the count instead of adding tasks. */
export function exceptionKey(kind: "fund" | "investor" | "file", ...ids: string[]) {
  return `${kind}:${ids.join(":")}`;
}

export function issueAfterAttempts(issue: string, attempts: number): string {
  return attempts >= 3 && issue !== "conflict" && issue !== "permission_too_broad" ? "retry_failed" : issue;
}
