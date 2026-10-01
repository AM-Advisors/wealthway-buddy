// Server-only helpers for account security logging and alerts.
import { getRequest } from "@tanstack/react-start/server";

export type SecurityEventInput = {
  userId: string | null;
  email?: string | null | undefined;
  eventType: string;
  action?: string | null | undefined;
  path?: string | null | undefined;
  lat?: number | null | undefined;
  lng?: number | null | undefined;
  accuracy?: number | null | undefined;
  gpsDeclined?: boolean | undefined;
  deviceId?: string | null | undefined;
  sessionId?: string | null | undefined;
};

export type RequestGeo = {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  userAgent: string | null;
};

export function readRequestGeo(): RequestGeo {
  const req = getRequest() as (Request & { cf?: Record<string, unknown> }) | undefined;
  const h = req?.headers;
  const cf = (req?.cf ?? {}) as Record<string, unknown>;
  const ip =
    h?.get("cf-connecting-ip") ?? h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? null;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    ip,
    city: str(cf["city"]) ?? h?.get("cf-ipcity") ?? null,
    region: str(cf["region"]) ?? h?.get("cf-region") ?? null,
    country: str(cf["country"]) ?? h?.get("cf-ipcountry") ?? null,
    userAgent: h?.get("user-agent")?.slice(0, 400) ?? null,
  };
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Writes one append-only security event. Never throws. */
export async function recordSecurityEvent(input: SecurityEventInput) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const geo = readRequestGeo();
    const lat = num(input.lat);
    const lng = num(input.lng);
    const deviceHash = input.deviceId ? await sha256(`${input.userId ?? ""}:${input.deviceId}`) : null;
    await supabaseAdmin.from("security_events").insert({
      user_id: input.userId,
      email: input.email?.toLowerCase() ?? null,
      event_type: input.eventType.slice(0, 60),
      action: input.action?.slice(0, 200) ?? null,
      path: input.path?.slice(0, 400) ?? null,
      ip: geo.ip,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      lat,
      lng,
      accuracy_m: num(input.accuracy),
      location_source: lat != null && lng != null ? "gps" : geo.ip ? "ip" : "none",
      gps_declined: !!input.gpsDeclined,
      user_agent: geo.userAgent,
      device_hash: deviceHash,
      session_id: input.sessionId?.slice(0, 100) ?? null,
    });
    return { geo, deviceHash };
  } catch (e) {
    console.error("security event log failed", e);
    return { geo: readRequestGeo(), deviceHash: null };
  }
}

/**
 * Tracks the device; on a new device or new country for a user who already
 * has history, emails a new-location alert with a "This wasn't me" link.
 */
export async function trackDeviceAndAlert(opts: {
  userId: string;
  email: string | null;
  deviceHash: string | null;
  geo: RequestGeo;
  origin: string;
}) {
  if (!opts.deviceHash) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: devices } = await supabaseAdmin
      .from("known_devices")
      .select("device_hash, country")
      .eq("user_id", opts.userId);
    const list = devices ?? [];
    const existing = list.find((d) => d.device_hash === opts.deviceHash);
    const knownCountries = new Set(list.map((d) => d.country).filter(Boolean));
    const now = new Date().toISOString();
    await supabaseAdmin.from("known_devices").upsert(
      {
        user_id: opts.userId,
        device_hash: opts.deviceHash,
        country: opts.geo.country,
        user_agent: opts.geo.userAgent,
        last_seen: now,
        last_ip: opts.geo.ip,
        last_city: opts.geo.city,
        last_region: opts.geo.region,
        revoked_at: null,
      },
      { onConflict: "user_id,device_hash" },
    );
    const newDevice = !existing;
    const newCountry = !!opts.geo.country && list.length > 0 && !knownCountries.has(opts.geo.country);
    if (list.length === 0 || !(newDevice || newCountry) || !opts.email) return;

    const token = randomToken();
    await supabaseAdmin.from("security_revoke_tokens").insert({
      token_hash: await sha256(token),
      user_id: opts.userId,
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    });
    const where = [opts.geo.city, opts.geo.region, opts.geo.country].filter(Boolean).join(", ") || "an unknown location";
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("security-alert", opts.email, {
      templateData: {
        where,
        device: opts.geo.userAgent ?? "Unknown device",
        occurredAt: now,
        reason: newCountry ? "new location" : "new device",
        revokeUrl: `${opts.origin}/api/public/security/revoke?token=${token}`,
      },
    });
  } catch (e) {
    console.error("device tracking failed", e);
  }
}
