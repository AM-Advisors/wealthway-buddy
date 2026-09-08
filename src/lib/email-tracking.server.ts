// Server-only: signs and verifies click-tracking links for onboarding emails.

const enc = new TextEncoder();

export const TRACKING_BASE = "https://onboard.harmonious.co";

export interface TrackedLink {
  /** Destination the recipient is sent to. */
  url: string;
  /** Recipient address the email was sent to. */
  recipient: string;
  /** Template name, e.g. "investor-invitation". */
  template?: string;
  /** Human label for the link, e.g. "Begin onboarding". */
  label?: string;
  /** Related row in investor_emails, when the send is logged there. */
  emailId?: string;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function sign(payload: string): Promise<string> {
  const secret = process.env["EMAIL_TRACKING_SECRET"];
  if (!secret) throw new Error("EMAIL_TRACKING_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

/** Wraps a destination URL in a signed tracking link. */
export async function buildTrackedUrl(link: TrackedLink): Promise<string> {
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        u: link.url,
        r: link.recipient,
        t: link.template ?? null,
        l: link.label ?? null,
        e: link.emailId ?? null,
      }),
    ),
  );
  const token = `${payload}.${await sign(payload)}`;
  return `${TRACKING_BASE}/api/public/email/click?t=${encodeURIComponent(token)}`;
}

export interface DecodedTrackedLink {
  url: string;
  recipient: string;
  template: string | null;
  label: string | null;
  emailId: string | null;
}

/** Verifies a tracking token and returns its contents, or null when invalid. */
export async function decodeTrackedUrl(token: string): Promise<DecodedTrackedLink | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = await sign(payload);
  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    const url = String(parsed.u ?? "");
    if (!/^https:\/\//i.test(url)) return null;
    return {
      url,
      recipient: String(parsed.r ?? ""),
      template: parsed.t ?? null,
      label: parsed.l ?? null,
      emailId: parsed.e ?? null,
    };
  } catch {
    return null;
  }
}
