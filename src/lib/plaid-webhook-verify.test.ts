import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_AGE_SECONDS,
  resetPlaidKeyCache,
  sha256Hex,
  verifyPlaidWebhook,
} from "./plaid-webhook-verify.server";

const BODY = JSON.stringify({
  webhook_type: "TRANSACTIONS",
  webhook_code: "DEFAULT_UPDATE",
  item_id: "item-abc",
  new_transactions: 3,
});

let keyPair: CryptoKeyPair;
let publicJwk: JsonWebKey;

function b64url(bytes: Uint8Array | string) {
  const raw =
    typeof bytes === "string"
      ? bytes
      : String.fromCharCode(...Array.from(bytes));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Builds a Plaid-style ES256 verification token. */
async function makeToken(opts: {
  body: string;
  iat?: number;
  alg?: string;
  signWith?: CryptoKey;
}) {
  const header = { alg: opts.alg ?? "ES256", kid: "key-1", typ: "JWT" };
  const claims = {
    iat: opts.iat ?? Math.floor(Date.now() / 1000),
    request_body_sha256: await sha256Hex(opts.body),
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      opts.signWith ?? keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${b64url(signature)}`;
}

function headers(token: string) {
  return new Headers({ "plaid-verification": token, "content-type": "application/json" });
}

describe("Plaid webhook signature verification", () => {
  beforeEach(async () => {
    process.env["PLAID_CLIENT_ID"] = "test-client";
    process.env["PLAID_SECRET"] = "test-secret";
    process.env["PLAID_ENV"] = "sandbox";
    resetPlaidKeyCache();

    keyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            key: { kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y, kid: "key-1" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a delivery with no verification header", async () => {
    const result = await verifyPlaidWebhook(BODY, new Headers());
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid signature", async () => {
    const other = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const token = await makeToken({ body: BODY, signWith: other.privateKey });
    const result = await verifyPlaidWebhook(BODY, headers(token));
    expect(result).toMatchObject({ ok: false, reason: "invalid signature" });
  });

  it("rejects an algorithm other than ES256", async () => {
    const token = await makeToken({ body: BODY, alg: "none" });
    const result = await verifyPlaidWebhook(BODY, headers(token));
    expect(result).toMatchObject({ ok: false, reason: "unsupported algorithm" });
  });

  it("rejects a stale delivery", async () => {
    const stale = Math.floor(Date.now() / 1000) - (MAX_AGE_SECONDS + 60);
    const token = await makeToken({ body: BODY, iat: stale });
    const result = await verifyPlaidWebhook(BODY, headers(token));
    expect(result).toMatchObject({ ok: false, reason: "stale delivery" });
  });

  it("rejects a body modified after signing", async () => {
    const token = await makeToken({ body: BODY });
    const tampered = JSON.stringify({ ...JSON.parse(BODY), new_transactions: 99999 });
    const result = await verifyPlaidWebhook(tampered, headers(token));
    expect(result).toMatchObject({ ok: false, reason: "body does not match signature" });
  });

  it("accepts a valid, fresh, correctly hashed delivery", async () => {
    const token = await makeToken({ body: BODY });
    const result = await verifyPlaidWebhook(BODY, headers(token));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyId).toBe("key-1");
      expect(result.bodySha256).toBe(await sha256Hex(BODY));
    }
  });

  it("rejects when Plaid credentials are unavailable, before any processing", async () => {
    delete process.env["PLAID_CLIENT_ID"];
    resetPlaidKeyCache();
    const token = await makeToken({ body: BODY });
    const result = await verifyPlaidWebhook(BODY, headers(token));
    expect(result).toMatchObject({ ok: false, reason: "verification key unavailable" });
  });
});
