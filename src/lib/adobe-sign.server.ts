// Server-only Adobe Acrobat Sign (REST API v6) client.
// Never import from client components.

const REST = "api/rest/v6";

function token() {
  const t = process.env["ADOBE_SIGN_INTEGRATION_KEY"];
  if (!t) throw new Error("Adobe Sign is not configured yet.");
  return t;
}

let cachedBase: { value: string; at: number } | null = null;

/** Adobe shards accounts across api.naN/euN hosts; discover the right one once. */
export async function adobeBaseUri(): Promise<string> {
  const configured = process.env["ADOBE_SIGN_BASE_URI"];
  if (configured) return configured.replace(/\/+$/, "");
  if (cachedBase && Date.now() - cachedBase.at < 60 * 60 * 1000) return cachedBase.value;

  const res = await fetch(`https://api.adobesign.com/${REST}/baseUris`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Adobe Sign base URI lookup failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { apiAccessPoint?: string };
  const value = (json.apiAccessPoint ?? "https://api.adobesign.com/").replace(/\/+$/, "");
  cachedBase = { value, at: Date.now() };
  return value;
}

async function adobeFetch(path: string, init: RequestInit & { raw?: boolean } = {}) {
  const base = await adobeBaseUri();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token()}`);
  const res = await fetch(`${base}/${REST}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[adobe-sign] ${path} failed [${res.status}]: ${body}`);
    throw new Error(`Adobe Sign request failed [${res.status}]: ${body}`);
  }
  return res;
}

/** Uploads PDF bytes as a transient document and returns its id. */
export async function uploadTransientDocument(fileName: string, bytes: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append("File-Name", fileName);
  form.append("Mime-Type", "application/pdf");
  form.append(
    "File",
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    fileName,
  );
  const res = await adobeFetch("/transientDocuments", { method: "POST", body: form });
  const json = (await res.json()) as { transientDocumentId: string };
  return json.transientDocumentId;
}

export interface CreateAgreementInput {
  name: string;
  transientDocumentId: string;
  signerEmail: string;
  signerName?: string;
  message?: string;
  /** Correlation data echoed back by Adobe on every webhook event. */
  externalId?: string;
}

/** Sends the agreement out for signature and returns the Adobe agreement id. */
export async function createAgreement(input: CreateAgreementInput): Promise<string> {
  const body: Record<string, unknown> = {
    fileInfos: [{ transientDocumentId: input.transientDocumentId }],
    name: input.name,
    participantSetsInfo: [
      { memberInfos: [{ email: input.signerEmail }], order: 1, role: "SIGNER" },
    ],
    signatureType: "ESIGN",
    state: "IN_PROCESS",
  };
  if (input.message) body["message"] = input.message;
  if (input.externalId) body["externalId"] = { id: input.externalId };

  const res = await adobeFetch("/agreements", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** Embedded signing URL for the signer, valid for a short window. */
export async function getSigningUrl(agreementId: string): Promise<string | null> {
  try {
    const res = await adobeFetch(`/agreements/${encodeURIComponent(agreementId)}/signingUrls`);
    const json = (await res.json()) as {
      signingUrlSetInfos?: { signingUrls?: { esignUrl?: string }[] }[];
    };
    return json.signingUrlSetInfos?.[0]?.signingUrls?.[0]?.esignUrl ?? null;
  } catch {
    // Adobe returns 404 until the agreement is fully created; caller can retry.
    return null;
  }
}

export async function getAgreement(agreementId: string) {
  const res = await adobeFetch(`/agreements/${encodeURIComponent(agreementId)}`);
  return (await res.json()) as { id: string; status: string; name?: string };
}

/** The certified, combined PDF including Adobe's audit page. */
export async function getCombinedDocument(agreementId: string): Promise<Uint8Array> {
  const res = await adobeFetch(`/agreements/${encodeURIComponent(agreementId)}/combinedDocument`);
  return new Uint8Array(await res.arrayBuffer());
}

export function isAdobeSignConfigured() {
  return Boolean(process.env["ADOBE_SIGN_INTEGRATION_KEY"]);
}

/** Adobe statuses -> our simplified signature lifecycle. */
export function mapAgreementStatus(status: string): "out_for_signature" | "completed" | "cancelled" | "expired" {
  const s = status.toUpperCase();
  if (s === "SIGNED" || s === "APPROVED" || s === "COMPLETED") return "completed";
  if (s === "CANCELLED" || s === "ABORTED" || s === "ARCHIVED") return "cancelled";
  if (s === "EXPIRED") return "expired";
  return "out_for_signature";
}
