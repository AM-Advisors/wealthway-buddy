/**
 * Server-side upload checks shared by every base64 upload handler.
 * The file type is decided from the file's own bytes (plus its extension for
 * Office/text formats), never from the caller-supplied content type.
 */

export type UploadKind = "pdf" | "docx" | "xlsx" | "pptx" | "doc" | "xls" | "ppt" | "png" | "jpg" | "gif" | "webp" | "csv" | "txt";

const MIME: Record<UploadKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  csv: "text/csv",
  txt: "text/plain",
};

export const DOCUMENT_KINDS: UploadKind[] = ["pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "png", "jpg", "csv", "txt"];

function startsWith(b: Uint8Array, sig: number[], offset = 0) {
  if (b.length < offset + sig.length) return false;
  return sig.every((v, i) => b[offset + i] === v);
}

function detect(bytes: Uint8Array, fileName: string): UploadKind | null {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === "docx" || ext === "xlsx" || ext === "pptx") return ext;
    return null;
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (ext === "doc" || ext === "xls" || ext === "ppt") return ext;
    return null;
  }
  if (ext === "csv" || ext === "txt") {
    const sample = bytes.subarray(0, 4096);
    if (sample.includes(0)) return null;
    return ext;
  }
  return null;
}

/** Throws a friendly error unless the bytes are a non-empty allowed file within the size limit. Returns the trusted content type. */
export function validateUpload(
  bytes: Uint8Array,
  fileName: string,
  opts: { allowed: UploadKind[]; maxBytes: number; label?: string },
): { kind: UploadKind; contentType: string } {
  const label = opts.label ?? "File";
  if (bytes.length === 0) throw new Error("That file appears to be empty.");
  if (bytes.length > opts.maxBytes) {
    throw new Error(`${label}s must be ${Math.floor(opts.maxBytes / (1024 * 1024))} MB or smaller.`);
  }
  const kind = detect(bytes, fileName);
  if (!kind || !opts.allowed.includes(kind)) {
    throw new Error(`That file type isn't accepted here. Allowed: ${opts.allowed.map((k) => k.toUpperCase()).join(", ")}.`);
  }
  return { kind, contentType: MIME[kind] };
}
