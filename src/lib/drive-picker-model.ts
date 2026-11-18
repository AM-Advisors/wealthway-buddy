// Pure rules for picking investor documents from the Harmonious Google Drive.

export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
export const MAX_PICK_BYTES = 10 * 1024 * 1024;
export const MAX_PICK_FILES = 10;

export type PickMime = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
const DIRECT: readonly string[] = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export type DriveEntry = { id: string; name: string; kind: "folder" | "file"; mimeType: string; size: number | null; modifiedTime: string | null; readable: boolean; why: string | null };
export type DriveCrumb = { id: string; name: string };

/** Drive IDs are opaque URL-safe tokens; anything else is rejected before a request is made. */
export function isDriveId(v: unknown): v is string {
  return typeof v === "string" && /^[\w-]{10,120}$/.test(v);
}

/** Folder or file ID from a pasted Drive link (or a bare ID). */
export function driveIdFromLink(text: string): { id: string; kind: "folder" | "file" | "unknown" } | null {
  const t = text.trim();
  const folder = t.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?)?folders\/([\w-]{10,120})/);
  if (folder) return { id: folder[1]!, kind: "folder" };
  const file = t.match(/(?:drive|docs)\.google\.com\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]{10,120})/);
  if (file) return { id: file[1]!, kind: "file" };
  const open = t.match(/drive\.google\.com\/open\?(?:.*&)?id=([\w-]{10,120})/);
  if (open) return { id: open[1]!, kind: "unknown" };
  return null;
}

/** Whether the AI reader can take this file, and what it is sent as. Google Docs are exported as PDF. */
export function readableAs(mimeType: string, size: number | null): { ok: true; as: PickMime } | { ok: false; why: string } {
  if (mimeType === GOOGLE_DOC_MIME) return { ok: true, as: "application/pdf" };
  if (!DIRECT.includes(mimeType)) return { ok: false, why: "Only PDFs, images and Google Docs can be read." };
  if (size != null && size > MAX_PICK_BYTES) return { ok: false, why: "Over 10 MB." };
  return { ok: true, as: mimeType as PickMime };
}

/** Escape a search term for a Drive query string literal. */
export function driveQueryLiteral(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** File name sent to the reader: Google Docs get a .pdf suffix. */
export function pickedFileName(name: string, mimeType: string) {
  const base = name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 190) || "document";
  return mimeType === GOOGLE_DOC_MIME && !/\.pdf$/i.test(base) ? `${base}.pdf` : base;
}

/** Folders first, then files, each by name. */
export function sortEntries(list: DriveEntry[]) {
  return [...list].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) : a.kind === "folder" ? -1 : 1));
}

export function toEntry(f: { id: string; name?: string; mimeType?: string; size?: string | number | null; modifiedTime?: string | null }): DriveEntry {
  const mimeType = String(f.mimeType ?? "");
  const size = f.size == null ? null : Number(f.size);
  if (mimeType === FOLDER_MIME) return { id: f.id, name: String(f.name ?? "Folder"), kind: "folder", mimeType, size: null, modifiedTime: f.modifiedTime ?? null, readable: false, why: null };
  const r = readableAs(mimeType, size);
  return { id: f.id, name: String(f.name ?? "File"), kind: "file", mimeType, size, modifiedTime: f.modifiedTime ?? null, readable: r.ok, why: r.ok ? null : r.why };
}
