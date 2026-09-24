/**
 * Google Drive filing rules. Drive is a repository only: Harmonious records
 * stay authoritative. Folders are found by the app tag (appProperties
 * harmonious_key) inside a known parent, never by name alone.
 */

export const FUND_SUBFOLDERS = [
  "01 - Fund Documents",
  "02 - Formation & Regulatory",
  "03 - Banking",
  "04 - Accounting & Tax",
  "05 - Reports",
  "Investors",
] as const;

export const INVESTOR_SUBFOLDERS = [
  "01 - Subscription Documents",
  "02 - Tax",
  "03 - Compliance",
  "04 - Accreditation",
  "05 - Executed Documents",
] as const;

export const FOLDER_MIME = "application/vnd.google-apps.folder";

const PROFILE_LABELS: Record<string, string> = {
  individual: "Individual",
  joint: "Joint",
  llc: "LLC",
  corporation: "Corporation",
  partnership: "Partnership",
  trust: "Trust",
  ira: "IRA-SDIRA",
  sdira: "IRA-SDIRA",
  ira_sdira: "IRA-SDIRA",
  retirement_plan: "Retirement Plan",
};

export function profileTypeLabel(type: string | null | undefined): string {
  const key = String(type ?? "").toLowerCase();
  return PROFILE_LABELS[key] ?? (key ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Investor");
}

/** Drive-safe folder name: no slashes or control characters, trimmed. */
export function safeName(value: string): string {
  return value.replace(/[\u0000-\u001f/\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled";
}

export function investorFolderName(displayName: string, profileType: string | null | undefined) {
  return safeName(`${displayName} - ${profileTypeLabel(profileType)}`);
}

export const fundKey = (offeringId: string) => `fund:${offeringId}`;
export const investorKey = (offeringId: string, profileId: string) => `investor:${offeringId}:${profileId}`;
export const subKey = (parentKey: string, name: string) => `${parentKey}/${name}`;

/** Dated, never-overwriting file name for an executed document. */
export function executedFileName(title: string, completedAt: string, version: string) {
  const date = completedAt.slice(0, 10);
  return safeName(`${date} - ${title} - executed v${version}.pdf`);
}

export type DriveFile = { id: string; name: string; appProperties?: Record<string, string> };

export interface DriveClient {
  findByKey(parentId: string, key: string): Promise<DriveFile | null>;
  findByName(parentId: string, name: string): Promise<DriveFile[]>;
  createFolder(parentId: string, name: string, key: string): Promise<DriveFile>;
  renameFolder(folderId: string, name: string): Promise<void>;
  uploadPdf(parentId: string, name: string, bytes: Uint8Array, key: string): Promise<DriveFile>;
}

export class DriveConflictError extends Error {
  constructor(public folderName: string, public existingIds: string[]) {
    super(`A folder named "${folderName}" already exists but was not created by Harmonious. Link it or create a new one.`);
  }
}

/**
 * Find the tagged folder, or create it. An untagged folder with the same name
 * is a conflict for review — never adopted, moved, renamed or deleted.
 */
export async function ensureTaggedFolder(
  drive: DriveClient,
  parentId: string,
  name: string,
  key: string,
  opts: { allowNameConflict?: boolean } = {},
): Promise<{ folder: DriveFile; created: boolean }> {
  const existing = await drive.findByKey(parentId, key);
  if (existing) return { folder: existing, created: false };
  if (!opts.allowNameConflict) {
    const sameName = await drive.findByName(parentId, name);
    if (sameName.length) throw new DriveConflictError(name, sameName.map((f) => f.id));
  }
  return { folder: await drive.createFolder(parentId, name, key), created: true };
}

export async function ensureSubfolders(
  drive: DriveClient,
  parentId: string,
  parentKey: string,
  names: readonly string[],
  known: Record<string, string> = {},
) {
  const out: Record<string, string> = { ...known };
  const created: string[] = [];
  for (const name of names) {
    if (out[name]) continue;
    // Subfolders sit inside a Harmonious-owned folder, so a same-named untagged
    // subfolder there is not a conflict; the tag still prevents duplicates.
    const res = await ensureTaggedFolder(drive, parentId, name, subKey(parentKey, name), { allowNameConflict: true });
    out[name] = res.folder.id;
    if (res.created) created.push(name);
  }
  return { subfolders: out, created };
}

/** Which investor subfolders an executed document is filed into. */
export function filingTargets(docKind: string | null | undefined): string[] {
  const targets = ["05 - Executed Documents"];
  if (/subscription/i.test(String(docKind ?? ""))) targets.unshift("01 - Subscription Documents");
  return targets;
}

/** Tax forms (W-9 / W-8) never go to Drive: shared-drive members cannot be excluded. */
export function isTaxForm(title: string | null | undefined): boolean {
  return /\bw-?(9|8[a-z-]*)\b/i.test(String(title ?? ""));
}
