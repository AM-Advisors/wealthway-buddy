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

export interface OpenPixel {
  recipient: string;
  template?: string;
  emailId?: string;
  applicationId?: string;
}

/** Signed 1x1 pixel URL used to record that an onboarding email was opened. */
export async function buildOpenPixelUrl(pixel: OpenPixel): Promise<string> {
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        r: pixel.recipient,
        t: pixel.template ?? null,
        e: pixel.emailId ?? null,
        a: pixel.applicationId ?? null,
      }),
    ),
  );
  const token = `${payload}.${await sign(payload)}`;
  return `${TRACKING_BASE}/api/public/email/open?t=${encodeURIComponent(token)}`;
}

export interface DecodedOpenPixel {
  recipient: string;
  template: string | null;
  emailId: string | null;
  applicationId: string | null;
}

/** Verifies an open-tracking token and returns its contents, or null when invalid. */
export async function decodeOpenPixel(token: string): Promise<DecodedOpenPixel | null> {
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
    const recipient = String(parsed.r ?? "");
    if (!recipient) return null;
    return {
      recipient,
      template: parsed.t ?? null,
      emailId: parsed.e ?? null,
      applicationId: parsed.a ?? null,
    };
  } catch {
    return null;
  }
}


/**
 * Adds open + click tracking to a marketing or flow email. `key` is "mk:<emailId>" or "flow:<sendId>".
 * The unsubscribe link is never wrapped.
 */
export async function trackMarketingHtml(html: string, recipient: string, key: string, unsubscribeUrl: string): Promise<string> {
  const hrefs = [...new Set([...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1]!))].filter((h) => h !== unsubscribeUrl && !h.includes("/unsubscribe/"));
  let out = html;
  for (const h of hrefs) {
    const real = h.replace(/&amp;/g, "&");
    const tracked = await buildTrackedUrl({ url: real, recipient, template: key });
    out = out.split(`href="${h}"`).join(`href="${tracked}"`);
  }
  const pixel = await buildOpenPixelUrl({ recipient, template: key });
  return out.replace("</body>", `<img src="${pixel}" width="1" height="1" alt="" style="display:none"/></body>`);
}

/** Records an open/click for marketing and flow emails. Returns false when the key isn't one of ours. */
export async function recordMarketingEvent(db: any, key: string | null, recipient: string, kind: "open" | "click", request: Request, url?: string) {
  if (!key || !(key.startsWith("mk:") || key.startsWith("flow:") || key.startsWith("prop:"))) return false;
  const id = key.slice(key.indexOf(":") + 1);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const hash = ip ? b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`${ip}|${process.env["EMAIL_TRACKING_SECRET"] ?? ""}`)))).slice(0, 22) : null;
  const { error } = await db.from("marketing_email_events").insert({
    source: key.startsWith("mk:") ? "campaign" : key.startsWith("prop:") ? "proposal" : "flow", sales_document_id: key.startsWith("prop:") ? id : null, email_id: key.startsWith("mk:") ? id : null, flow_send_id: key.startsWith("flow:") ? id : null,
    recipient, kind, url: url ?? null, ip_hash: hash, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
  });
  if (error) console.error("marketing email event not saved", error.message);
  return true;
}

/** Signed, unguessable link to the approved version of a sent Sales document. */
export async function signProposalView(documentId: string, version: number): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ d: documentId, v: version })));
  return `${TRACKING_BASE}/api/public/proposal/view?t=${encodeURIComponent(`${payload}.${await sign(payload)}`)}`;
}
export async function verifyProposalView(token: string): Promise<{ documentId: string; version: number } | null> {
  const dot = token.lastIndexOf("."); if (dot <= 0) return null;
  const payload = token.slice(0, dot); const provided = token.slice(dot + 1); const expected = await sign(payload);
  if (provided.length !== expected.length) return null;
  let diff = 0; for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try { const p = JSON.parse(new TextDecoder().decode(fromB64url(payload))); return p.d && Number.isInteger(p.v) ? { documentId: String(p.d), version: Number(p.v) } : null; } catch { return null; }
}
