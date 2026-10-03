import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuthUnverified as requireSupabaseAuth } from "@/lib/require-auth";
import { randomToken, recordSecurityEvent, sha256, trackDeviceAndAlert } from "./account-security.server";

const EVENT_TYPES = [
  "sign_in",
  "sign_out",
  "page_view",
  "sensitive_action",
  "mfa_verified",
  "mfa_failed",
  "mfa_enrolled",
  "mfa_removed",
  "recovery_code_used",
  "session_timeout",
  "heartbeat",
] as const;

const logSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  action: z.string().max(200).optional(),
  path: z.string().max(400).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(1e7).optional(),
  gpsDeclined: z.boolean().optional(),
  deviceId: z.string().max(100).optional(),
  sessionId: z.string().max(100).optional(),
});

function bearer() {
  return getRequest()?.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

async function isRevoked(userId: string, iat: number | undefined) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("security_session_revocations")
    .select("revoked_after")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !iat) return false;
  return iat * 1000 < new Date(data.revoked_after).getTime();
}

/** Records a security event for the signed-in user; returns signOut if this session was revoked. */
export const logSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => logSchema.parse(d))
  .handler(async ({ data, context }) => {
    const claims = context.claims as { email?: string; iat?: number; session_id?: string };
    const userId = context.userId;
    if (await isRevoked(userId, claims.iat)) return { signOut: true };
    if (data.eventType === "heartbeat") return { signOut: false };
    const { geo, deviceHash } = await recordSecurityEvent({
      userId,
      email: claims.email ?? null,
      eventType: data.eventType,
      action: data.action,
      path: data.path,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      gpsDeclined: data.gpsDeclined,
      deviceId: data.deviceId,
      sessionId: data.sessionId ?? claims.session_id ?? null,
    });
    if (data.eventType === "sign_in") {
      const origin = new URL(getRequest()?.url ?? "https://app.harmonious.co").origin;
      await trackDeviceAndAlert({ userId, email: claims.email ?? null, deviceHash, geo, origin });
    }
    return { signOut: false };
  });

/** The signed-in user's devices and recent sign-in / security history. */
export const getMySecurity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: devices }, { data: events }] = await Promise.all([
      context.supabase
        .from("known_devices")
        .select("id, device_hash, user_agent, country, last_city, last_region, last_ip, first_seen, last_seen, revoked_at")
        .order("last_seen", { ascending: false }),
      context.supabase
        .from("security_events")
        .select("id, event_type, action, ip, city, region, country, location_source, user_agent, created_at")
        .eq("user_id", context.userId)
        .neq("event_type", "page_view")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("used_at", null);
    return { devices: devices ?? [], events: events ?? [], recoveryCodesLeft: count ?? 0 };
  });

/** Signs out every other session of the caller (native session revocation). */
export const signOutOtherSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.signOut(bearer(), "others");
    await supabaseAdmin
      .from("known_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", context.userId);
    await recordSecurityEvent({ userId: context.userId, eventType: "sign_out", action: "signed out other sessions" });
    return { ok: true };
  });

/** Issues 10 fresh single-use recovery codes (shown once). Requires a verified second step. */
export const generateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = context.claims as { aal?: string };
    if (claims.aal !== "aal2") throw new Error("Verify your second step first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("mfa_recovery_codes")
      .update({ used_at: now })
      .eq("user_id", context.userId)
      .is("used_at", null);
    const codes: string[] = [];
    const rows = [];
    for (let i = 0; i < 10; i++) {
      const raw = randomToken(5).toUpperCase();
      const code = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
      const salt = randomToken(8);
      codes.push(code);
      rows.push({ user_id: context.userId, salt, code_hash: await sha256(`${salt}:${code}`) });
    }
    await supabaseAdmin.from("mfa_recovery_codes").insert(rows);
    return { codes };
  });

/** Uses a recovery code: removes the lost second-step methods so the user enrolls new ones. */
export const useRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().trim().min(6).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.toUpperCase();
    const { data: rows } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .select("id, salt, code_hash")
      .eq("user_id", context.userId)
      .is("used_at", null);
    let match: string | null = null;
    for (const r of rows ?? []) {
      if ((await sha256(`${r.salt}:${code}`)) === r.code_hash) match = r.id;
    }
    if (!match) {
      await recordSecurityEvent({ userId: context.userId, eventType: "mfa_failed", action: "bad recovery code" });
      return { ok: false };
    }
    await supabaseAdmin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", match);
    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId });
    for (const f of factors?.factors ?? []) {
      await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId: context.userId });
    }
    await recordSecurityEvent({ userId: context.userId, eventType: "recovery_code_used" });
    return { ok: true };
  });

// ---------- Super Administrator tools ----------

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_platform_admin", { _uid: context.userId });
  if (!data) throw new Error("Forbidden");
}

export const listSecurityActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().max(200).optional(),
        ip: z.string().max(100).optional(),
        country: z.string().max(10).optional(),
        eventType: z.string().max(60).optional(),
        page: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    let q = context.supabase
      .from("security_events")
      .select(
        "id, user_id, email, event_type, action, path, ip, city, region, country, lat, lng, accuracy_m, location_source, gps_declined, user_agent, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(data.page * 50, data.page * 50 + 49);
    if (data.email) q = q.ilike("email", `%${data.email}%`);
    if (data.ip) q = q.eq("ip", data.ip);
    if (data.country) q = q.eq("country", data.country.toUpperCase());
    if (data.eventType) q = q.eq("event_type", data.eventType);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: resets } = await supabaseAdmin
      .from("mfa_reset_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      rows: rows ?? [],
      total: count ?? 0,
      resets: (resets ?? []).map((r) => ({ ...r, canDecide: r.status === "pending" && r.requested_by !== context.userId })),
    };
  });

export const requestMfaReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().trim().email().max(200),
        reason: z.string().trim().min(5).max(500),
        identityCheck: z.string().trim().min(5).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email")
      .ilike("email", data.email)
      .maybeSingle();
    if (!prof?.user_id) throw new Error("No account found for that email.");
    await supabaseAdmin.from("mfa_reset_requests").insert({
      target_user_id: prof.user_id,
      target_email: data.email.toLowerCase(),
      reason: data.reason,
      identity_check: data.identityCheck,
      requested_by: context.userId,
    });
    return { ok: true };
  });

export const decideMfaReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ id: z.string().uuid(), approve: z.boolean(), reason: z.string().trim().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin.from("mfa_reset_requests").select("*").eq("id", data.id).maybeSingle();
    if (!req || req.status !== "pending") throw new Error("Request is not pending.");
    if (req.requested_by === context.userId) throw new Error("A different administrator must decide.");
    if (!data.approve && !data.reason) throw new Error("A reason is required to decline.");
    const { error } = await supabaseAdmin
      .from("mfa_reset_requests")
      .update({
        status: data.approve ? "approved" : "declined",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        decision_reason: data.reason ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.approve) {
      const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: req.target_user_id });
      for (const f of factors?.factors ?? []) {
        await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId: req.target_user_id });
      }
      await recordSecurityEvent({
        userId: req.target_user_id,
        email: req.target_email,
        eventType: "mfa_removed",
        action: "staff reset (approved)",
      });
    }
    return { ok: true };
  });
