// Server-only: legacy archive uploads to the dedicated Object Lock bucket via
// the "Harmonious Legacy Archive AWS API" gateway connection. Every request
// carries a signed x-amz-checksum-sha256; large files use S3 multipart with
// 5 MiB parts so each gateway request stays under its ~6 MiB body cap.
// Never deletes objects; never sends retention or bypass headers.

export const ARCHIVE_BUCKET = "harmonious-legacy-archives-661771927821";
export const ARCHIVE_PREFIX = "legacy-system-archives/";
export const PART_SIZE = 5 * 1024 * 1024; // S3 minimum for non-final parts
export const SINGLE_PUT_MAX = 5 * 1024 * 1024;
const GATEWAY = `https://connector-gateway.lovable.dev/aws/s3/${ARCHIVE_BUCKET}`;

export interface PartRecord { partNumber: number; etag: string; checksumSha256: string; size: number }
export interface UploadManifest {
  key: string; size: number; sha256Hex: string; uploadId?: string;
  parts: PartRecord[]; versionId?: string; status: "pending" | "uploading" | "complete" | "aborted" | "failed";
  error?: string;
}

function headers(extra: Record<string, string> = {}) {
  const l = process.env.LOVABLE_API_KEY, a = process.env.AWS_API_KEY;
  if (!l || !a) throw new Error("Archive connection is not configured");
  return { Authorization: `Bearer ${l}`, "X-Connection-Api-Key": a, ...extra };
}
function assertKey(key: string) {
  if (!key.startsWith(ARCHIVE_PREFIX) || key.includes("..")) throw new Error("Key outside archive prefix");
}
const enc = (key: string) => key.split("/").map(encodeURIComponent).join("/");

async function sha256(bytes: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");

export class AwsError extends Error {
  constructor(public status: number, public code: string, public body: string, public requestId: string | null) {
    super(`AWS ${status} ${code}: ${body.slice(0, 300)}`);
  }
}

async function call(method: string, path: string, init: { body?: Uint8Array | string; headers?: Record<string, string> } = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${GATEWAY}/${path}`, { method, headers: headers(init.headers), body: init.body as BodyInit | undefined });
    if (r.ok) return r;
    const text = await r.text();
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? "Unknown";
    const retryable = r.status >= 500 || r.status === 429 || code.startsWith("Throttl") || code === "SlowDown";
    if (!retryable || attempt >= 5) throw new AwsError(r.status, code, text, r.headers.get("x-amz-request-id"));
    await new Promise((s) => setTimeout(s, 500 * 2 ** attempt));
  }
}

export async function putSmall(key: string, bytes: Uint8Array, contentType = "application/octet-stream") {
  assertKey(key);
  if (bytes.length > SINGLE_PUT_MAX) throw new Error("Use multipart for files over 5 MiB");
  const r = await call("PUT", enc(key), { body: bytes, headers: { "x-amz-checksum-sha256": b64(await sha256(bytes)), "Content-Type": contentType } });
  return { versionId: r.headers.get("x-amz-version-id") };
}

/** Starts or resumes a multipart upload. `manifest` is persisted by the caller after every part. */
export async function uploadMultipart(
  key: string, bytes: Uint8Array, manifest: UploadManifest | null,
  onProgress: (m: UploadManifest) => Promise<void> | void = () => {},
): Promise<UploadManifest> {
  assertKey(key);
  const m: UploadManifest = manifest ?? { key, size: bytes.length, sha256Hex: hex(await sha256(bytes)), parts: [], status: "pending" };
  if (m.key !== key || m.size !== bytes.length) throw new Error("Manifest does not match file");
  if (m.status === "complete") return m;
  try {
    if (!m.uploadId) {
      const r = await call("POST", `${enc(key)}?uploads`, { headers: { "x-amz-checksum-algorithm": "SHA256", "Content-Type": "application/octet-stream" } });
      m.uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await r.text())?.[1];
      if (!m.uploadId) throw new Error("No UploadId returned");
      m.status = "uploading"; await onProgress(m);
    }
    const total = Math.ceil(bytes.length / PART_SIZE);
    const done = new Set(m.parts.map((p) => p.partNumber));
    for (let n = 1; n <= total; n++) {
      if (done.has(n)) continue;
      const chunk = bytes.subarray((n - 1) * PART_SIZE, Math.min(n * PART_SIZE, bytes.length));
      const cs = b64(await sha256(chunk));
      const r = await call("PUT", `${enc(key)}?partNumber=${n}&uploadId=${encodeURIComponent(m.uploadId)}`, { body: chunk, headers: { "x-amz-checksum-sha256": cs } });
      m.parts.push({ partNumber: n, etag: r.headers.get("etag") ?? "", checksumSha256: cs, size: chunk.length });
      await onProgress(m);
    }
    m.parts.sort((a, b) => a.partNumber - b.partNumber);
    const xml = `<CompleteMultipartUpload>${m.parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}</ETag><ChecksumSHA256>${p.checksumSha256}</ChecksumSHA256></Part>`).join("")}</CompleteMultipartUpload>`;
    const r = await call("POST", `${enc(key)}?uploadId=${encodeURIComponent(m.uploadId)}`, { body: xml, headers: { "Content-Type": "application/xml" } });
    const body = await r.text();
    if (body.includes("<Error>")) throw new AwsError(200, /<Code>([^<]+)/.exec(body)?.[1] ?? "Unknown", body, r.headers.get("x-amz-request-id"));
    m.versionId = r.headers.get("x-amz-version-id") ?? undefined;
    m.status = "complete"; await onProgress(m);
    return m;
  } catch (e) {
    m.status = "failed"; m.error = String((e as Error).message).slice(0, 400); await onProgress(m);
    throw e;
  }
}

/** Cancels an incomplete multipart upload (needs s3:AbortMultipartUpload). Never deletes completed objects. */
export async function abortMultipart(key: string, uploadId: string) {
  assertKey(key);
  await call("DELETE", `${enc(key)}?uploadId=${encodeURIComponent(uploadId)}`);
}

/** Lists parts already stored for an upload (needs s3:ListMultipartUploadParts). */
export async function listParts(key: string, uploadId: string) {
  assertKey(key);
  const r = await call("GET", `${enc(key)}?uploadId=${encodeURIComponent(uploadId)}`);
  return await r.text();
}

/** Lists incomplete uploads under the prefix (needs s3:ListBucketMultipartUploads). */
export async function listIncompleteUploads() {
  const r = await call("GET", `?uploads&prefix=${encodeURIComponent(ARCHIVE_PREFIX)}`);
  return await r.text();
}

/** Downloads a version in 5 MiB ranges and returns its full SHA-256. */
export async function downloadSha256(key: string, versionId: string, size: number) {
  assertKey(key);
  const out = new Uint8Array(size);
  for (let off = 0; off < size; off += PART_SIZE) {
    const end = Math.min(off + PART_SIZE, size) - 1;
    const r = await call("GET", `${enc(key)}?versionId=${encodeURIComponent(versionId)}`, { headers: { Range: `bytes=${off}-${end}` } });
    out.set(new Uint8Array(await r.arrayBuffer()), off);
  }
  return hex(await sha256(out));
}

export async function readRetention(key: string, versionId: string) {
  assertKey(key);
  const r = await call("GET", `${enc(key)}?retention&versionId=${encodeURIComponent(versionId)}`);
  const t = await r.text();
  return { mode: /<Mode>([^<]+)/.exec(t)?.[1], retainUntil: /<RetainUntilDate>([^<]+)/.exec(t)?.[1], hasEventHold: /EventHold/.test(t), requestId: r.headers.get("x-amz-request-id") };
}
