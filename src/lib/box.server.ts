// Server-only Box client: OAuth 2.0 client-credentials auth, file storage
// and Box Sign requests. Never import from client components.

const API = "https://api.box.com/2.0";
const UPLOAD = "https://upload.box.com/api/2.0";

let cachedToken: { value: string; expiresAt: number } | null = null;

function config() {
  const clientId = process.env["BOX_CLIENT_ID"];
  const clientSecret = process.env["BOX_CLIENT_SECRET"];
  const enterpriseId = process.env["BOX_ENTERPRISE_ID"];
  if (!clientId || !clientSecret || !enterpriseId) {
    throw new Error("Box is not configured yet.");
  }
  return { clientId, clientSecret, enterpriseId };
}

export function isBoxConfigured() {
  return Boolean(
    process.env["BOX_CLIENT_ID"] &&
      process.env["BOX_CLIENT_SECRET"] &&
      process.env["BOX_ENTERPRISE_ID"],
  );
}

/** Folder that holds every signed fund document; falls back to the root folder. */
export function boxFolderId() {
  return process.env["BOX_FOLDER_ID"] ?? "0";
}

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const { clientId, clientSecret, enterpriseId } = config();

  const res = await fetch("https://api.box.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      box_subject_type: "enterprise",
      box_subject_id: enterpriseId,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Box auth failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function boxFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await accessToken()}`);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[box] ${url} failed [${res.status}]: ${body}`);
    throw new Error(`Box request failed [${res.status}]: ${body}`);
  }
  return res;
}

/** Uploads PDF bytes into the fund documents folder and returns the Box file id. */
export async function uploadFile(fileName: string, bytes: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append(
    "attributes",
    JSON.stringify({ name: fileName, parent: { id: boxFolderId() } }),
  );
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), fileName);

  const res = await fetch(`${UPLOAD}/files/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}` },
    body: form,
  });
  const text = await res.text();

  // A same-named file already there: upload a new version instead.
  if (res.status === 409) {
    const conflictId = (JSON.parse(text) as any)?.context_info?.conflicts?.id as string | undefined;
    if (conflictId) {
      const versionForm = new FormData();
      versionForm.append("attributes", JSON.stringify({ name: fileName }));
      versionForm.append(
        "file",
        new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        fileName,
      );
      const versionRes = await boxFetch(`${UPLOAD}/files/${conflictId}/content`, {
        method: "POST",
        body: versionForm,
      });
      const versionJson = (await versionRes.json()) as { entries: { id: string }[] };
      return versionJson.entries[0]!.id;
    }
  }

  if (!res.ok) throw new Error(`Box upload failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { entries: { id: string }[] };
  return json.entries[0]!.id;
}

export interface CreateSignRequestInput {
  fileId: string;
  signerEmail: string;
  signerName?: string;
  documentName: string;
  message?: string;
  /** Correlation value echoed back on every Box Sign webhook. */
  externalId?: string;
  redirectUrl?: string;
}

export interface BoxSignRequest {
  id: string;
  status: string;
  signingUrl: string | null;
  signedFileId: string | null;
  /** True once the signer has opened the document in Box. */
  viewed: boolean;
  /** When Box first recorded the signer opening or acting on the request. */
  viewedAt: string | null;
}

function parseSignRequest(json: any): BoxSignRequest {
  const signer = (json?.signers ?? []).find((s: any) => s.role === "signer") ?? json?.signers?.[0];
  const signerStatus = String(signer?.signer_decision?.type ?? "").toLowerCase();
  const requestStatus = String(json?.status ?? "unknown").toLowerCase();
  const viewed =
    Boolean(signer?.has_viewed_document) ||
    signerStatus === "viewed" ||
    signerStatus === "signed" ||
    requestStatus === "viewed" ||
    requestStatus === "signed" ||
    requestStatus === "completed";
  const finalizedAt = signer?.signer_decision?.finalized_at ?? null;
  return {
    id: String(json?.id ?? ""),
    status: String(json?.status ?? "unknown"),
    signingUrl: signer?.embed_url ?? signer?.iframeable_embed_url ?? null,
    signedFileId: json?.sign_files?.files?.[0]?.id ?? null,
    viewed,
    viewedAt: finalizedAt ? new Date(finalizedAt).toISOString() : null,
  };
}

/** Sends a document out for signature through Box Sign. */
export async function createSignRequest(input: CreateSignRequestInput): Promise<BoxSignRequest> {
  const body: Record<string, unknown> = {
    source_files: [{ type: "file", id: input.fileId }],
    parent_folder: { type: "folder", id: boxFolderId() },
    signers: [
      {
        email: input.signerEmail,
        role: "signer",
        embed_url_external_user_id: input.externalId,
        ...(input.signerName ? { name: input.signerName } : {}),
      },
    ],
    name: input.documentName,
    is_document_preparation_needed: false,
    ...(input.message ? { email_message: input.message } : {}),
    ...(input.externalId ? { external_id: input.externalId } : {}),
    ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
  };

  const res = await boxFetch(`${API}/sign_requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseSignRequest(await res.json());
}

export async function getSignRequest(signRequestId: string): Promise<BoxSignRequest> {
  const res = await boxFetch(`${API}/sign_requests/${encodeURIComponent(signRequestId)}`);
  return parseSignRequest(await res.json());
}

/** Downloads a Box file's bytes (the certified signed PDF once complete). */
export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const res = await boxFetch(`${API}/files/${encodeURIComponent(fileId)}/content`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Box Sign statuses -> our simplified signature lifecycle. */
export function mapSignStatus(
  status: string,
): "out_for_signature" | "completed" | "cancelled" | "expired" {
  const s = status.toLowerCase();
  if (s === "signed" || s === "completed") return "completed";
  if (s === "cancelled" || s === "declined" || s.startsWith("error")) return "cancelled";
  if (s === "expired") return "expired";
  return "out_for_signature";
}

/** Finds or creates a subfolder under a parent folder and returns its Box id. */
export async function ensureSubfolder(name: string, parentId = boxFolderId()): Promise<string> {
  const res = await fetch(`${API}/folders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name, parent: { id: parentId } }),
  });
  const text = await res.text();
  if (res.ok) return String((JSON.parse(text) as any).id);
  if (res.status === 409) {
    const existing = (JSON.parse(text) as any)?.context_info?.conflicts?.[0]?.id;
    if (existing) return String(existing);
  }
  throw new Error(`Box folder create failed [${res.status}]: ${text}`);
}

/** Uploads arbitrary bytes into a specific Box folder. */
export async function uploadFileTo(
  parentId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<{ id: string; size: number }> {
  const form = new FormData();
  form.append("attributes", JSON.stringify({ name: fileName, parent: { id: parentId } }));
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: contentType }), fileName);

  const res = await fetch(`${UPLOAD}/files/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}` },
    body: form,
  });
  const text = await res.text();
  if (res.status === 409) {
    const conflictId = (JSON.parse(text) as any)?.context_info?.conflicts?.id as string | undefined;
    if (conflictId) {
      const versionForm = new FormData();
      versionForm.append("attributes", JSON.stringify({ name: fileName }));
      versionForm.append(
        "file",
        new Blob([bytes as unknown as BlobPart], { type: contentType }),
        fileName,
      );
      const versionRes = await boxFetch(`${UPLOAD}/files/${conflictId}/content`, {
        method: "POST",
        body: versionForm,
      });
      const versionJson = (await versionRes.json()) as { entries: { id: string; size?: number }[] };
      const entry = versionJson.entries[0]!;
      return { id: entry.id, size: entry.size ?? bytes.length };
    }
  }
  if (!res.ok) throw new Error(`Box upload failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { entries: { id: string; size?: number }[] };
  const entry = json.entries[0]!;
  return { id: entry.id, size: entry.size ?? bytes.length };
}

/** Returns a short-lived direct download URL for a Box file. */
export async function temporaryDownloadUrl(fileId: string): Promise<string> {
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/content`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    redirect: "manual",
  });
  const location = res.headers.get("location");
  if (location) return location;
  const body = await res.text();
  throw new Error(`Box download link failed [${res.status}]: ${body}`);
}

/** Moves a Box file to trash. */
export async function deleteBoxFile(fileId: string): Promise<void> {
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Box delete failed [${res.status}]: ${await res.text()}`);
  }
}

/** Lists the files directly inside a Box folder. */
export async function listFolderFiles(
  folderId: string,
): Promise<{ id: string; name: string; size: number; modified_at: string }[]> {
  const res = await boxFetch(
    `${API}/folders/${encodeURIComponent(folderId)}/items?fields=id,name,size,modified_at&limit=1000`,
  );
  const json = (await res.json()) as { entries: any[] };
  return (json.entries ?? [])
    .filter((e) => e.type === "file")
    .map((e) => ({
      id: String(e.id),
      name: String(e.name),
      size: Number(e.size ?? 0),
      modified_at: String(e.modified_at ?? ""),
    }));
}

/**
 * Lists every file inside a Box folder and its subfolders, keeping the
 * subfolder path so the caller can guess which section a file belongs in.
 */
export async function listFolderTree(
  folderId: string,
  depth = 2,
  path: string[] = [],
): Promise<{ id: string; name: string; size: number; modified_at: string; created_at: string; path: string[] }[]> {
  const res = await boxFetch(
    `${API}/folders/${encodeURIComponent(folderId)}/items?fields=id,name,size,type,modified_at,created_at&limit=1000`,
  );
  const json = (await res.json()) as { entries: any[] };
  const entries = json.entries ?? [];

  const files = entries
    .filter((e) => e.type === "file")
    .map((e) => ({
      id: String(e.id),
      name: String(e.name),
      size: Number(e.size ?? 0),
      modified_at: String(e.modified_at ?? ""),
      created_at: String(e.created_at ?? e.modified_at ?? ""),
      path,
    }));

  if (depth <= 0) return files;

  const nested = await Promise.all(
    entries
      .filter((e) => e.type === "folder")
      .map((e) => listFolderTree(String(e.id), depth - 1, [...path, String(e.name)])),
  );
  return [...files, ...nested.flat()];
}

// ---------------------------------------------------------------------------
// Box-connected signing: version locking, multiple signers, embedded sessions.
// ---------------------------------------------------------------------------

/** The Box file version currently held by a file. Used to lock a signing request. */
export async function fileVersionId(fileId: string): Promise<string | null> {
  const res = await boxFetch(
    `${API}/files/${encodeURIComponent(fileId)}?fields=file_version,etag`,
  );
  const json = (await res.json()) as any;
  return json?.file_version?.id ? String(json.file_version.id) : null;
}

export interface BoxSignSigner {
  email: string;
  name: string | null;
  role: string;
  /** External correlation value we set, so a signer maps back to our record. */
  externalUserId: string | null;
  decision: string | null;
  viewed: boolean;
  /** Embeddable ceremony URL. Only ever handed to the verified signer. */
  embedUrl: string | null;
  signedAt: string | null;
}

export interface BoxSignDetail {
  id: string;
  status: string;
  sourceFileId: string | null;
  sourceFileVersionId: string | null;
  signedFileId: string | null;
  signedFileVersionId: string | null;
  signers: BoxSignSigner[];
}

function parseSignDetail(json: any): BoxSignDetail {
  const source = json?.source_files?.[0] ?? null;
  const signed = json?.sign_files?.files?.[0] ?? null;
  const signers: BoxSignSigner[] = (json?.signers ?? [])
    .filter((s: any) => String(s?.role ?? "signer") === "signer")
    .map((s: any) => ({
      email: String(s?.email ?? "").toLowerCase(),
      name: s?.name ?? null,
      role: String(s?.role ?? "signer"),
      externalUserId: s?.embed_url_external_user_id ?? null,
      decision: s?.signer_decision?.type ? String(s.signer_decision.type).toLowerCase() : null,
      viewed: Boolean(s?.has_viewed_document),
      embedUrl: s?.iframeable_embed_url ?? s?.embed_url ?? null,
      signedAt: s?.signer_decision?.finalized_at
        ? new Date(s.signer_decision.finalized_at).toISOString()
        : null,
    }));

  return {
    id: String(json?.id ?? ""),
    status: String(json?.status ?? "unknown"),
    sourceFileId: source?.id ? String(source.id) : null,
    sourceFileVersionId: source?.file_version?.id ? String(source.file_version.id) : null,
    signedFileId: signed?.id ? String(signed.id) : null,
    signedFileVersionId: signed?.file_version?.id ? String(signed.file_version.id) : null,
    signers,
  };
}

export interface MultiSignerInput {
  fileId: string;
  documentName: string;
  message?: string;
  externalId: string;
  redirectUrl?: string;
  signers: {
    email: string;
    name?: string | null;
    order?: number;
    /** Correlates the Box signer back to our own signer row. */
    externalUserId: string;
  }[];
}

/** Sends a document to every required signer and returns the full Box detail. */
export async function createMultiSignerRequest(input: MultiSignerInput): Promise<BoxSignDetail> {
  const body: Record<string, unknown> = {
    source_files: [{ type: "file", id: input.fileId }],
    parent_folder: { type: "folder", id: boxFolderId() },
    signers: input.signers.map((s) => ({
      email: s.email,
      role: "signer",
      order: s.order ?? 1,
      embed_url_external_user_id: s.externalUserId,
      ...(s.name ? { name: s.name } : {}),
    })),
    name: input.documentName,
    is_document_preparation_needed: false,
    external_id: input.externalId,
    ...(input.message ? { email_message: input.message } : {}),
    ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
  };

  const res = await boxFetch(`${API}/sign_requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseSignDetail(await res.json());
}

/** Full detail for a signing request, straight from Box — the only authority. */
export async function getSignRequestDetail(signRequestId: string): Promise<BoxSignDetail> {
  const res = await boxFetch(`${API}/sign_requests/${encodeURIComponent(signRequestId)}`);
  return parseSignDetail(await res.json());
}

/** Asks Box to email every outstanding signer again. */
export async function resendSignRequest(signRequestId: string): Promise<void> {
  await boxFetch(`${API}/sign_requests/${encodeURIComponent(signRequestId)}/resend`, {
    method: "POST",
  });
}

/** Cancels an outstanding request in Box. Completed requests cannot be cancelled. */
export async function cancelSignRequest(signRequestId: string): Promise<BoxSignDetail> {
  const res = await boxFetch(`${API}/sign_requests/${encodeURIComponent(signRequestId)}/cancel`, {
    method: "POST",
  });
  return parseSignDetail(await res.json());
}
