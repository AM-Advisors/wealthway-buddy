import { createHmac, timingSafeEqual } from "crypto";

export const DIDIT_MAX_SKEW_SECONDS = 300;

/**
 * Canonical JSON: object keys sorted lexicographically, no extra whitespace,
 * Unicode characters preserved (never escaped to \uXXXX).
 */
export function canonicalJson(value: unknown): string {
  if (typeof value === "number") {
    // Didit serialises whole-valued floats as ints (e.g. 36.0 -> 36).
    if (!Number.isInteger(value) && value % 1 === 0) value = Math.trunc(value);
    return JSON.stringify(value);
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a.trim().toLowerCase().replace(/^sha256=/, ""), "utf8");
  const bufB = Buffer.from(b.trim().toLowerCase(), "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type SignatureVariant = "v2" | "raw" | "simple";

export interface VerifyInput {
  secret: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureV2: string | null;
  signature: string | null;
  signatureSimple: string | null;
  now?: number;
}

export type VerifyResult =
  | { ok: true; variant: SignatureVariant; body: Record<string, any> }
  | { ok: false; reason: string; debug?: Record<string, { got: string; want: string }> };

export function verifyDiditWebhook(input: VerifyInput): VerifyResult {
  const { secret, rawBody } = input;
  if (!secret) return { ok: false, reason: "missing_secret" };

  const timestamp = Number(input.timestampHeader);
  if (!input.timestampHeader || !Number.isFinite(timestamp)) {
    return { ok: false, reason: "missing_timestamp" };
  }
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > DIDIT_MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid_json" };

  if (input.signatureV2 && safeEqual(input.signatureV2, hmacHex(secret, canonicalJson(body)))) {
    return { ok: true, variant: "v2", body };
  }
  if (input.signature && safeEqual(input.signature, hmacHex(secret, rawBody))) {
    return { ok: true, variant: "raw", body };
  }
  if (input.signatureSimple) {
    // Didit signs "{body.timestamp}:{session_id}:{status}:{webhook_type}".
    const simple = `${body["timestamp"] ?? input.timestampHeader}:${body["session_id"] ?? ""}:${body["status"] ?? ""}:${body["webhook_type"] ?? ""}`;
    if (safeEqual(input.signatureSimple, hmacHex(secret, simple))) {
      return { ok: true, variant: "simple", body };
    }
  }
  return {
    ok: false,
    reason: "bad_signature",
    debug: {
      v2: { got: (input.signatureV2 ?? "").slice(0, 12), want: hmacHex(secret, canonicalJson(body)).slice(0, 12) },
      raw: { got: (input.signature ?? "").slice(0, 12), want: hmacHex(secret, rawBody).slice(0, 12) },
      simple: {
        got: (input.signatureSimple ?? "").slice(0, 12),
        want: hmacHex(secret, `${body["timestamp"] ?? input.timestampHeader}:${body["session_id"] ?? ""}:${body["status"] ?? ""}:${body["webhook_type"] ?? ""}`).slice(0, 12),
      },
    },
  };
}

export type CheckStatus = "not_started" | "pending" | "review" | "approved" | "declined";

export interface StatusMapping {
  kyc: CheckStatus;
  expired: boolean;
  completed: boolean;
}

export function mapDiditStatus(status: string | undefined): StatusMapping | null {
  switch (status) {
    case "Approved":
      return { kyc: "approved", expired: false, completed: true };
    case "Declined":
      return { kyc: "declined", expired: false, completed: true };
    case "In Review":
      return { kyc: "review", expired: false, completed: false };
    case "In Progress":
    case "Not Started":
    case "Resubmitted":
      return { kyc: "pending", expired: false, completed: false };
    case "Abandoned":
    case "Expired":
    case "KYC Expired":
      return { kyc: "pending", expired: true, completed: false };
    default:
      return null;
  }
}

/** Collects warnings from every per-feature array in a V3 decision object. */
export function collectDecisionWarnings(decision: any): string[] {
  if (!decision || typeof decision !== "object") return [];
  const out: string[] = [];
  for (const value of Object.values(decision)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const warnings = item?.warnings;
      if (!Array.isArray(warnings)) continue;
      for (const w of warnings) {
        const text = typeof w === "string" ? w : (w?.short_description ?? w?.risk ?? w?.log_type);
        if (text) out.push(String(text));
      }
    }
  }
  return out;
}

/** Reduces the AML screenings in a decision to a single check status. */
export function amlStatusFromDecision(decision: any): { status: CheckStatus; matches: any[] } | null {
  const screenings = decision?.aml_screenings;
  if (!Array.isArray(screenings) || screenings.length === 0) return null;
  const matches = screenings.flatMap((s: any) => (Array.isArray(s?.hits) ? s.hits : []));
  const statuses = screenings.map((s: any) => String(s?.status ?? "").toLowerCase());
  let status: CheckStatus = "approved";
  if (statuses.some((s) => s === "declined" || s === "failed")) status = "declined";
  else if (statuses.some((s) => s === "in review" || s === "review" || s === "warning")) status = "review";
  else if (statuses.some((s) => s === "in progress" || s === "pending")) status = "pending";
  else if (matches.length > 0) status = "review";
  return { status, matches };
}
