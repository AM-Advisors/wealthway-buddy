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
}

function parseSignRequest(json: any): BoxSignRequest {
  const signer = (json?.signers ?? []).find((s: any) => s.role === "signer") ?? json?.signers?.[0];
  return {
    id: String(json?.id ?? ""),
    status: String(json?.status ?? "unknown"),
    signingUrl: signer?.embed_url ?? signer?.iframeable_embed_url ?? null,
    signedFileId: json?.sign_files?.files?.[0]?.id ?? null,
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
  if (s === "signed" || s === "finalizing" || s === "completed") return "completed";
  if (s === "cancelled" || s === "declined" || s.startsWith("error")) return "cancelled";
  if (s === "expired") return "expired";
  return "out_for_signature";
}
