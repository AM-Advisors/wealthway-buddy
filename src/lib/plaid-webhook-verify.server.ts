/**
 * Verification of Plaid webhook deliveries.
 *
 * Plaid signs every webhook with a JWT in the `Plaid-Verification` header.
 * The JWT is ES256-signed with a key we fetch from Plaid's webhook
 * verification key endpoint, and its `request_body_sha256` claim commits to
 * the exact raw body that was signed. We therefore:
 *
 *  1. Require the ES256 algorithm (never `none`, never a symmetric alg).
 *  2. Fetch (and cache) the public key for the JWT's `kid` from Plaid.
 *  3. Verify the signature over the raw header.payload bytes.
 *  4. Require the delivery to be fresh (`iat` within a short window).
 *  5. Compare SHA-256 of the *raw, unparsed* body against the signed hash,
 *     using the timing-safe comparison from the internal-job helper.
 *
 * Nothing is parsed, persisted or acted on until all five checks pass.
 */

import { timingSafeEqualStrings } from "@/lib/internal-job-auth.server";

const ALLOWED_ALG = "ES256";
/** Plaid recommends rejecting anything older than five minutes. */
export const MAX_AGE_SECONDS = 5 * 60;

export type PlaidVerificationResult =
  | { ok: true; keyId: string; bodySha256: string }
  | { ok: false; reason: string };

type PlaidJwk = {
  kty: string;
  crv: string;
  x: string;
  y: string;
  alg?: string;
  kid?: string;
  use?: string;
  expired_at?: number | null;
};

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string): any {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
}

export async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function plaidBase() {
  const env = (process.env["PLAID_ENV"] ?? "sandbox").toLowerCase();
  return env === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
}

/** Verification keys are stable; cache them so replayed traffic is cheap. */
const keyCache = new Map<string, PlaidJwk>();

export function resetPlaidKeyCache() {
  keyCache.clear();
}

async function fetchVerificationKey(keyId: string): Promise<PlaidJwk | null> {
  const cached = keyCache.get(keyId);
  if (cached) return cached;

  const clientId = process.env["PLAID_CLIENT_ID"];
  const secret = process.env["PLAID_SECRET"];
  if (!clientId || !secret) return null;

  const response = await fetch(`${plaidBase()}/webhook_verification_key/get`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, key_id: keyId }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { key?: PlaidJwk };
  if (!payload.key || payload.key.kty !== "EC" || payload.key.crv !== "P-256") return null;
  keyCache.set(keyId, payload.key);
  return payload.key;
}

async function verifySignature(jwk: PlaidJwk, signingInput: string, signature: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature as unknown as ArrayBufferView,
    new TextEncoder().encode(signingInput),
  );
}

/**
 * Validates the `Plaid-Verification` JWT against the raw request body.
 * `rawBody` must be the untouched bytes as delivered — re-serialising parsed
 * JSON changes the hash and (correctly) fails verification.
 */
export async function verifyPlaidWebhook(
  rawBody: string,
  headers: Headers,
  now: number = Date.now(),
): Promise<PlaidVerificationResult> {
  const token = headers.get("plaid-verification");
  if (!token) return { ok: false, reason: "missing verification header" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed verification token" };

  let header: { alg?: string; kid?: string };
  let claims: { iat?: number; request_body_sha256?: string };
  try {
    header = decodeJson(parts[0]!);
    claims = decodeJson(parts[1]!);
  } catch {
    return { ok: false, reason: "malformed verification token" };
  }

  if (header.alg !== ALLOWED_ALG) return { ok: false, reason: "unsupported algorithm" };
  if (!header.kid) return { ok: false, reason: "missing key id" };

  const key = await fetchVerificationKey(header.kid);
  if (!key) return { ok: false, reason: "verification key unavailable" };

  let valid = false;
  try {
    valid = await verifySignature(key, `${parts[0]}.${parts[1]}`, base64UrlDecode(parts[2]!));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "invalid signature" };

  if (typeof claims.iat !== "number") return { ok: false, reason: "missing issued-at" };
  const ageSeconds = Math.floor(now / 1000) - claims.iat;
  if (ageSeconds > MAX_AGE_SECONDS || ageSeconds < -MAX_AGE_SECONDS) {
    return { ok: false, reason: "stale delivery" };
  }

  const signedHash = claims.request_body_sha256;
  if (typeof signedHash !== "string" || signedHash.length !== 64) {
    return { ok: false, reason: "missing body hash" };
  }
  const actualHash = await sha256Hex(rawBody);
  if (!timingSafeEqualStrings(signedHash.toLowerCase(), actualHash)) {
    return { ok: false, reason: "body does not match signature" };
  }

  return { ok: true, keyId: header.kid, bodySha256: actualHash };
}
